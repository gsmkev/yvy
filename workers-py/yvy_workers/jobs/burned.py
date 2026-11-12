"""Área quemada después de un foco de fuego (S-20), por lote, con Sentinel-2 L2A.

Método (indicativo): para cada incendio (focos de FIRMS ya guardados por el job firms_hotspots, agrupados
por cercanía en el tiempo) que cae sobre un lote:
  1. Compuesto "antes": mediana de hasta 3 escenas limpias en los 45 días previos al primer foco.
  2. Compuesto "después": mediana de hasta 3 escenas limpias entre 5 y 45 días después del último foco.
  3. NBR = (NIR - SWIR2) / (NIR + SWIR2) con B08 y B12; dNBR = NBR_antes - NBR_después.
  4. Quemado = dNBR >= 0,27 (severidad moderada, USGS); severidad alta = dNBR >= 0,66.
  5. Parches de al menos 0,5 ha por lote y hectáreas quemadas por lote.

Los umbrales son los del USGS (FIREMON) y no están calibrados en campo: sirven para priorizar qué recorrer y
para el parte de pérdidas, no para un peritaje. Fuente de los focos: NASA FIRMS; imágenes: Sentinel-2.
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from rasterio.features import geometry_mask
from shapely.geometry import Point, mapping

from ..geo import from_crs, to_crs
from ..ingest import IngestClient
from .eudr import PIXEL_HA, _round_coords, loss_patches, outline
from .s2 import Grid, _epoch_ms, dilate, farm_bbox, make_grid, reflectance, scl_valid, search

log = logging.getLogger(__name__)

DNBR_BURNED = 0.27  # severidad moderada-baja en adelante (USGS)
DNBR_HIGH = 0.66  # severidad alta
MIN_PATCH_HA = 0.5
EVENT_GAP_DAYS = 10  # focos separados por más que esto son otro incendio
PRE_WINDOW_DAYS = 45
POST_FROM_DAYS = 5  # esperar a que baje el humo y se asiente la ceniza
POST_WINDOW_DAYS = 45
COMPOSITE_SCENES = 3
NEAR_PLOT_M = 500.0  # un foco VIIRS tiene 375 m de píxel: cuenta si está a menos de esto del lote
MIN_VALID_PCT = 60.0
MAX_EVENTS = 5
HOTSPOT_DAYS = 120
MAX_SEARCH_CLOUD = 60.0
MAX_POLYS_PER_PLOT = 12
KIND = "burned"


@dataclass
class Event:
    first_at: int
    last_at: int
    points: list[tuple[float, float]]  # lon, lat

    @property
    def key(self) -> str:
        return datetime.fromtimestamp(self.first_at / 1000, tz=timezone.utc).date().isoformat()


def group_events(hotspots: list[dict[str, Any]], gap_days: int = EVENT_GAP_DAYS) -> list[Event]:
    """Agrupa los focos en incendios: se parte cuando pasan más de `gap_days` sin un foco nuevo."""
    events: list[Event] = []
    for h in sorted(hotspots, key=lambda x: x["acquiredAt"]):
        if events and h["acquiredAt"] - events[-1].last_at <= gap_days * 86_400_000:
            ev = events[-1]
            ev.last_at = h["acquiredAt"]
            ev.points.append((h["lon"], h["lat"]))
        else:
            events.append(Event(h["acquiredAt"], h["acquiredAt"], [(h["lon"], h["lat"])]))
    return events


def nbr(nir: np.ndarray, swir2: np.ndarray, valid: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        v = (nir - swir2) / (nir + swir2)
    return np.where(valid & np.isfinite(v) & (np.abs(v) <= 1), v, np.nan).astype("float32")


def median_nbr(stack: list[np.ndarray]) -> np.ndarray:
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmedian(np.stack(stack), axis=0).astype("float32")


def scene_nbr(item: dict[str, Any], grid: Grid) -> np.ndarray:
    valid = scl_valid(item, grid)
    valid &= ~dilate(~valid, 2)
    return nbr(reflectance(item, "nir", grid), reflectance(item, "swir22", grid), valid)


def classify_burn(pre: np.ndarray, post: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(válido, moderado, alto) a partir de los dos NBR."""
    valid = np.isfinite(pre) & np.isfinite(post)
    with np.errstate(invalid="ignore"):
        d = pre - post
        high = valid & (d >= DNBR_HIGH)
        moderate = valid & (d >= DNBR_BURNED) & ~high
    return valid, moderate, high


def analyze_burn(pre: np.ndarray, post: np.ndarray, grid: Grid, event: Event) -> list[dict[str, Any]]:
    """Resultado por lote cercano al incendio. Sin red ni disco."""
    valid, moderate, high = classify_burn(pre, post)
    pts = [to_crs(Point(lon, lat), grid.crs) for lon, lat in event.points]
    out: list[dict[str, Any]] = []
    for plot_id, geom in grid.plots:
        near = [p for p in pts if geom.distance(p) <= NEAR_PLOT_M]
        if not near:
            continue
        inside = geometry_mask([geom], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
        total = int(inside.sum())
        if total == 0:
            continue
        ok = inside & valid
        valid_pct = 100.0 * int(ok.sum()) / total
        row: dict[str, Any] = {
            "plotId": plot_id,
            "plotAreaHa": round(total * PIXEL_HA, 2),
            "validPct": round(valid_pct, 1),
            "burnedHa": 0.0,
            "highHa": 0.0,
            "hotspots": len(near),
            "changes": [],
        }
        if valid_pct >= MIN_VALID_PCT:
            patches: list[tuple[float, Any, str]] = []
            for mask, sev in ((high & ok, "high"), (moderate & ok, "moderate")):
                patches += [(ha, poly, sev) for ha, poly in loss_patches(mask, grid.transform, MIN_PATCH_HA)]
            patches.sort(key=lambda x: -x[0])
            row["burnedHa"] = round(sum(ha for ha, _, _ in patches), 2)
            row["highHa"] = round(sum(ha for ha, _, sev in patches if sev == "high"), 2)
            for ha, poly, sev in patches[:MAX_POLYS_PER_PLOT]:
                wgs = mapping(from_crs(outline(poly), grid.crs))
                row["changes"].append({"geometry": {"type": "Polygon", "coordinates": _round_coords(wgs["coordinates"])}, "areaHa": round(ha, 2), "severity": sev})
        out.append(row)
    return out


def _composite(items: list[dict[str, Any]], grid: Grid) -> np.ndarray | None:
    if not items:
        return None
    return median_nbr([scene_nbr(it, grid) for it in items])


def burned_event(api: IngestClient, farm: dict[str, Any], grid: Grid, event: Event, now: datetime) -> int:
    """Calcula y sube un incendio. Devuelve cuántos lotes se subieron (0 si aún no hay imagen de después)."""
    first = datetime.fromtimestamp(event.first_at / 1000, tz=timezone.utc)
    last = datetime.fromtimestamp(event.last_at / 1000, tz=timezone.utc)
    if now < last + timedelta(days=POST_FROM_DAYS):
        return 0
    bbox = farm_bbox(farm)
    before = search(bbox, first - timedelta(days=PRE_WINDOW_DAYS), first, MAX_SEARCH_CLOUD)[-COMPOSITE_SCENES:]
    after = search(bbox, last + timedelta(days=POST_FROM_DAYS), min(now, last + timedelta(days=POST_WINDOW_DAYS)), MAX_SEARCH_CLOUD)[:COMPOSITE_SCENES]
    pre, post = _composite(before, grid), _composite(after, grid)
    if pre is None or post is None:
        log.info("incendio %s: sin imágenes %s", event.key, "antes" if pre is None else "después")
        return 0
    rows = analyze_burn(pre, post, grid, event)
    from_at, to_at = _epoch_ms(before[-1]), _epoch_ms(after[-1])
    for r in rows:
        api.analysis(
            {
                "plotId": r["plotId"],
                "kind": KIND,
                "refKey": event.key,
                "fromAt": from_at,
                "toAt": to_at,
                "plotAreaHa": r["plotAreaHa"],
                "validPct": r["validPct"],
                "metrics": {"eventAt": event.first_at, "burnedHa": r["burnedHa"], "highHa": r["highHa"], "hotspots": r["hotspots"]},
                "changes": r["changes"],
            }
        )
    return len(rows)


def burned_area(api: IngestClient, farm: dict[str, Any], now: datetime | None = None) -> int:
    """Procesa los incendios recientes que tocan lotes de la estancia. Devuelve cuántos resultados de lote subió."""
    now = now or datetime.now(timezone.utc)
    hotspots = api.farm_hotspots(farm["id"], HOTSPOT_DAYS)
    if not hotspots:
        return 0
    geom = api.farm_geometry(farm["id"])
    if not geom["plots"]:
        return 0
    grid = make_grid(geom, buffer_m=500.0)
    written = 0
    for event in group_events(hotspots)[-MAX_EVENTS:]:
        try:
            written += burned_event(api, farm, grid, event, now)
        except Exception:  # un incendio que falla no frena a los demás
            log.exception("área quemada %s en %s: falló", event.key, farm["name"])
    return written
