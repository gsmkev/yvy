"""Cambio de cobertura entre dos fechas (S-31): monte, pastura, cultivo y otros, por lote, con Sentinel-2 L2A.

Pensado para informes ambientales y de bancos: cuántas hectáreas de monte pasaron a pastura, cultivo u otro uso.

Método (indicativo, clases simples):
  1. Por cada fecha, todas las escenas limpias de una ventana de 180 días centrada en ella (120 días antes
     y hasta 60 después, sin pasar de hoy). Con eso se saca, por píxel de 10 m, la mediana del NDVI, la mediana
     del NDMI y la amplitud del NDVI (p90 - p10): el monte casi no cambia en el año, el cultivo sube y baja.
  2. Clases, en este orden:
       otro      NDVI mediano < 0,25 (suelo desnudo, agua, construcciones)
       monte     NDVI >= 0,60, NDMI >= 0,10 y amplitud < 0,20
       cultivo   amplitud >= 0,30
       pastura   el resto con vegetación
  3. Cambio de monte = monte en la primera fecha que ya no lo es en la segunda, en parches de al menos 0,5 ha
     (definición de bosque de la FAO); se reparte según la clase de la segunda fecha.

Los umbrales no están calibrados en campo: el resultado es indicativo y la imagen satelital no distingue un
monte nativo de una plantación forestal. No es un peritaje ni una certificación.
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

import numpy as np
from rasterio.features import geometry_mask
from shapely.geometry import mapping

from ..geo import from_crs
from ..ingest import IngestClient
from .eudr import PIXEL_HA, _round_coords, loss_patches, outline, thin
from .s2 import Grid, _epoch_ms, farm_bbox, make_grid, search
from .eudr import scene_indices

log = logging.getLogger(__name__)

KIND = "cover_change"
INVALID, FOREST, PASTURE, CROP, OTHER = 0, 1, 2, 3, 4
OTHER_NDVI_MAX = 0.25
FOREST_NDVI_MIN = 0.60
FOREST_NDMI_MIN = 0.10
FOREST_AMP_MAX = 0.20
CROP_AMP_MIN = 0.30
MIN_OBS = 3  # observaciones válidas por píxel para clasificar
MIN_PATCH_HA = 0.5
MIN_VALID_PCT = 60.0
WINDOW_BEFORE_DAYS = 120
WINDOW_AFTER_DAYS = 60
MAX_SCENES = 20
MAX_SEARCH_CLOUD = 50.0
MAX_POLYS_PER_PLOT = 20
FIRST_DATE = date(2017, 1, 1)  # primeras escenas Sentinel-2


@dataclass
class CoverStack:
    ndvi: np.ndarray
    ndmi: np.ndarray
    amp: np.ndarray
    nobs: np.ndarray
    scenes: int
    first_at: int | None
    last_at: int | None


def classify_cover(ndvi: np.ndarray, ndmi: np.ndarray, amp: np.ndarray, nobs: np.ndarray) -> np.ndarray:
    """Clase por píxel: 0 inválido, 1 monte, 2 pastura, 3 cultivo, 4 otro."""
    ok = (nobs >= MIN_OBS) & np.isfinite(ndvi) & np.isfinite(ndmi) & np.isfinite(amp)
    cls = np.full(ndvi.shape, PASTURE, dtype="uint8")
    with np.errstate(invalid="ignore"):
        cls[amp >= CROP_AMP_MIN] = CROP
        cls[(ndvi >= FOREST_NDVI_MIN) & (ndmi >= FOREST_NDMI_MIN) & (amp < FOREST_AMP_MAX)] = FOREST
        cls[ndvi < OTHER_NDVI_MAX] = OTHER
    cls[~ok] = INVALID
    return cls


def analyze_cover(a: np.ndarray, b: np.ndarray, grid: Grid) -> list[dict[str, Any]]:
    """Resultado por lote a partir de las dos clasificaciones (en la grilla). Sin red ni disco.

    Las hectáreas por clase se cuentan solo sobre los píxeles válidos en las dos fechas, para que sean comparables.
    """
    both = (a != INVALID) & (b != INVALID)
    lost = both & (a == FOREST) & (b != FOREST)
    out: list[dict[str, Any]] = []
    for plot_id, geom in grid.plots:
        inside = geometry_mask([geom], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
        total = int(inside.sum())
        if total == 0:
            continue
        ok = inside & both
        valid_pct = 100.0 * int(ok.sum()) / total
        row: dict[str, Any] = {
            "plotId": plot_id,
            "plotAreaHa": round(total * PIXEL_HA, 2),
            "validPct": round(valid_pct, 1),
            "from": {"forest": 0.0, "pasture": 0.0, "crop": 0.0, "other": 0.0},
            "to": {"forest": 0.0, "pasture": 0.0, "crop": 0.0, "other": 0.0},
            "forestToPasture": 0.0,
            "forestToCrop": 0.0,
            "forestToOther": 0.0,
            "changes": [],
        }
        if valid_pct >= MIN_VALID_PCT:
            for name, code in (("forest", FOREST), ("pasture", PASTURE), ("crop", CROP), ("other", OTHER)):
                row["from"][name] = round(int((ok & (a == code)).sum()) * PIXEL_HA, 2)
                row["to"][name] = round(int((ok & (b == code)).sum()) * PIXEL_HA, 2)
            patches = loss_patches(lost & ok, grid.transform, MIN_PATCH_HA)
            # El cambio de monte se cuenta solo en parches de >= 0,5 ha, repartido según la clase de la segunda fecha
            in_patch = np.zeros(lost.shape, dtype=bool)
            for _, poly in patches:
                in_patch |= geometry_mask([poly], out_shape=lost.shape, transform=grid.transform, invert=True)
            counted = in_patch & lost & ok
            row["forestToPasture"] = round(int((counted & (b == PASTURE)).sum()) * PIXEL_HA, 2)
            row["forestToCrop"] = round(int((counted & (b == CROP)).sum()) * PIXEL_HA, 2)
            row["forestToOther"] = round(int((counted & (b == OTHER)).sum()) * PIXEL_HA, 2)
            for ha, poly in patches[:MAX_POLYS_PER_PLOT]:
                wgs = mapping(from_crs(outline(poly), grid.crs))
                row["changes"].append({"geometry": {"type": "Polygon", "coordinates": _round_coords(wgs["coordinates"])}, "areaHa": round(ha, 2)})
        out.append(row)
    return out


def stack_stats(ndvi_stack: list[np.ndarray], ndmi_stack: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    nv, nm = np.stack(ndvi_stack), np.stack(ndmi_stack)
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        med_v, med_m = np.nanmedian(nv, axis=0), np.nanmedian(nm, axis=0)
        amp = np.nanpercentile(nv, 90, axis=0) - np.nanpercentile(nv, 10, axis=0)
    return med_v.astype("float32"), med_m.astype("float32"), amp.astype("float32"), np.isfinite(nv).sum(axis=0)


def build_stack(farm: dict[str, Any], center: date, grid: Grid, now: datetime | None = None) -> CoverStack:
    now = now or datetime.now(timezone.utc)
    c = datetime(center.year, center.month, center.day, tzinfo=timezone.utc)
    start, end = c - timedelta(days=WINDOW_BEFORE_DAYS), min(c + timedelta(days=WINDOW_AFTER_DAYS), now)
    items = thin(search(farm_bbox(farm), start, end, MAX_SEARCH_CLOUD), MAX_SCENES)
    if len(items) < MIN_OBS:
        raise RuntimeError(f"Muy pocas escenas de Sentinel-2 limpias alrededor del {center.isoformat()} ({len(items)})")
    pairs = [scene_indices(it, grid) for it in items]
    v, m, amp, nobs = stack_stats([p[0] for p in pairs], [p[1] for p in pairs])
    times = [_epoch_ms(i) for i in items]
    return CoverStack(v, m, amp, nobs, len(items), min(times), max(times))


def validate_dates(d_from: date, d_to: date, today: date | None = None) -> None:
    today = today or datetime.now(timezone.utc).date()
    if d_from < FIRST_DATE or d_to > today or (d_to - d_from).days < 90:
        raise ValueError("Fechas inválidas: desde 2017, no futuras y con al menos 90 días de diferencia")


def cover_change(api: IngestClient, farm: dict[str, Any], d_from: date, d_to: date) -> int:
    """Calcula y sube el cambio de cobertura de cada lote de la estancia. Devuelve cuántos lotes subió."""
    validate_dates(d_from, d_to)
    geom = api.farm_geometry(farm["id"])
    if not geom["plots"]:
        return 0
    grid = make_grid(geom)
    sa, sb = build_stack(farm, d_from, grid), build_stack(farm, d_to, grid)
    rows = analyze_cover(
        classify_cover(sa.ndvi, sa.ndmi, sa.amp, sa.nobs),
        classify_cover(sb.ndvi, sb.ndmi, sb.amp, sb.nobs),
        grid,
    )
    key = f"{d_from.isoformat()}_{d_to.isoformat()}"
    for r in rows:
        api.analysis(
            {
                "plotId": r["plotId"],
                "kind": KIND,
                "refKey": key,
                "fromAt": sa.last_at,
                "toAt": sb.last_at,
                "plotAreaHa": r["plotAreaHa"],
                "validPct": r["validPct"],
                "metrics": {k: r[k] for k in ("from", "to", "forestToPasture", "forestToCrop", "forestToOther")},
                "changes": r["changes"],
            }
        )
    log.info("cobertura %s %s: %d lotes", farm["name"], key, len(rows))
    return len(rows)
