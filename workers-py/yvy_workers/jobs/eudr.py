"""Indicador de deforestación para la regulación europea (EUDR, S-30), por lote.

Método (indicativo, solo Sentinel-2 L2A de Earth Search):
  1. Dos compuestos de mediana de la estación seca (1 de junio al 30 de setiembre): el de 2020 (fecha de corte
     de la EUDR: 31 de diciembre de 2020) y el de la última estación seca terminada.
     En la estación seca los cultivos de verano y los pastos secos se ven peor que el monte, y hay pocas nubes.
  2. Por píxel de 10 m, "cobertura arbórea" si el NDVI y el NDMI (humedad de la vegetación) de la mediana
     superan los umbrales de abajo. NDVI = (NIR - rojo) / (NIR + rojo); NDMI = (NIR - SWIR1) / (NIR + SWIR1).
  3. "Posible pérdida de bosque" = cobertura arbórea en 2020 que hoy ya no la tiene (con una caída marcada
     del NDVI, para no marcar ruido) y que forma un parche de al menos 0,5 ha (definición de bosque de la FAO).
  4. Por lote: hectáreas de cobertura arbórea en 2020, hectáreas con posible pérdida y polígonos de cambio.

Los umbrales son indicativos, no están calibrados contra datos de campo: sirven para priorizar qué revisar, no
para certificar nada. No es una declaración de debida diligencia.
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

import numpy as np
from rasterio.features import geometry_mask, shapes
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

from ..geo import from_crs
from ..ingest import IngestClient
from .s2 import Grid, _epoch_ms, dilate, farm_bbox, make_grid, reflectance, scl_valid, search

log = logging.getLogger(__name__)

REF_YEAR = 2020  # fecha de corte de la EUDR: 31/12/2020
DRY_START = (6, 1)  # estación seca: 1 de junio ...
DRY_END = (9, 30)  # ... al 30 de setiembre
# Umbrales INDICATIVOS (sin calibrar en campo). Ajustables por constante.
FOREST_NDVI_MIN = 0.60  # cobertura arbórea: NDVI de la mediana seca igual o mayor
FOREST_NDMI_MIN = 0.10  # y NDMI igual o mayor (separa monte de pasto verde o cultivo con riego)
LOSS_NDVI_MAX = 0.50  # hoy ya no es cobertura arbórea: NDVI menor que esto
LOSS_NDVI_DROP = 0.20  # y cayó al menos esto respecto de 2020
MIN_PATCH_HA = 0.5  # parche mínimo de pérdida (definición de bosque FAO)
MIN_OBS = 2  # observaciones válidas por píxel para aceptar la mediana
MAX_COMPOSITE_SCENES = 24  # escenas por compuesto (repartidas a lo largo de la estación)
MAX_SEARCH_CLOUD = 50.0
MIN_VALID_PCT = 60.0  # lote con menos de esto de píxeles válidos en ambos compuestos: sin datos (RF-51)
MAX_POLYS_PER_PLOT = 20
SIMPLIFY_M = 15.0
# El Worker acepta hasta 300 puntos por anillo y 80 KB por lote: el mapa de cambios solo necesita el contorno.
MAX_RING_POINTS = 120
PIXEL_HA = 0.01  # 10 m x 10 m

STATUS_NO_CHANGE = "no_change"
STATUS_LOSS = "possible_loss"
STATUS_NO_DATA = "no_data"


def dry_season(year: int) -> tuple[datetime, datetime]:
    start = datetime(year, *DRY_START, tzinfo=timezone.utc)
    end = datetime(year, *DRY_END, 23, 59, 59, tzinfo=timezone.utc)
    return start, end


def latest_dry_season_year(today: date) -> int:
    """Último año con la estación seca ya terminada (así el compuesto es completo)."""
    return today.year if today > date(today.year, *DRY_END) else today.year - 1


def tree_cover(ndvi: np.ndarray, ndmi: np.ndarray) -> np.ndarray:
    with np.errstate(invalid="ignore"):
        return (ndvi >= FOREST_NDVI_MIN) & (ndmi >= FOREST_NDMI_MIN)


def classify_change(
    ref_ndvi: np.ndarray, ref_ndmi: np.ndarray, cur_ndvi: np.ndarray, cur_ndmi: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Devuelve (válido en ambos, cobertura arbórea en 2020, pérdida candidata). Sin filtrar parches."""
    valid = np.isfinite(ref_ndvi) & np.isfinite(ref_ndmi) & np.isfinite(cur_ndvi) & np.isfinite(cur_ndmi)
    forest_ref = valid & tree_cover(ref_ndvi, ref_ndmi)
    with np.errstate(invalid="ignore"):
        lost = forest_ref & (cur_ndvi < LOSS_NDVI_MAX) & (ref_ndvi - cur_ndvi >= LOSS_NDVI_DROP)
    return valid, forest_ref, lost


def outline(poly: BaseGeometry, tolerance: float = SIMPLIFY_M, max_points: int = MAX_RING_POINTS) -> BaseGeometry:
    """Contorno exterior simplificado hasta que entra en max_points (sin huecos: el mapa es indicativo)."""
    from shapely.geometry import Polygon

    exterior = Polygon(poly.exterior) if poly.geom_type == "Polygon" else Polygon(max(poly.geoms, key=lambda g: g.area).exterior)
    tol = tolerance
    simple = exterior.simplify(tol)
    while (simple.is_empty or simple.geom_type != "Polygon" or len(simple.exterior.coords) > max_points) and tol < 10_000:
        tol *= 2
        simple = exterior.simplify(tol)
    if simple.is_empty or simple.geom_type != "Polygon" or len(simple.exterior.coords) < 4:
        simple = exterior.envelope
    return simple


def _round_coords(c: Any, nd: int = 5) -> Any:
    if isinstance(c, (list, tuple)):
        return [_round_coords(x, nd) for x in c]
    return round(float(c), nd)


def loss_patches(lost: np.ndarray, transform: Any, min_ha: float = MIN_PATCH_HA) -> list[tuple[float, BaseGeometry]]:
    """Parches conexos (8 vecinos) de pérdida de al menos `min_ha`, los más grandes primero. Geometría en el CRS de la grilla."""
    found: list[tuple[float, BaseGeometry]] = []
    if not lost.any():
        return found
    for g, _ in shapes(lost.astype("uint8"), mask=lost, transform=transform, connectivity=8):
        poly = shape(g)
        ha = poly.area / 10_000
        if ha >= min_ha:
            found.append((ha, poly))
    found.sort(key=lambda x: -x[0])
    return found


def analyze_plots(
    ref: tuple[np.ndarray, np.ndarray],
    cur: tuple[np.ndarray, np.ndarray],
    grid: Grid,
) -> list[dict[str, Any]]:
    """Resultado por lote a partir de los dos compuestos (NDVI, NDMI) ya en la grilla. Sin red ni disco."""
    valid, forest_ref, lost = classify_change(ref[0], ref[1], cur[0], cur[1])
    out: list[dict[str, Any]] = []
    for plot_id, geom in grid.plots:
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
            "forestRefHa": 0.0,
            "lossHa": 0.0,
            "changes": [],
        }
        if valid_pct < MIN_VALID_PCT:
            row["status"] = STATUS_NO_DATA
            out.append(row)
            continue
        patches = loss_patches(lost & ok, grid.transform)
        row["forestRefHa"] = round(int((forest_ref & ok).sum()) * PIXEL_HA, 2)
        row["lossHa"] = round(sum(ha for ha, _ in patches), 2)
        row["status"] = STATUS_LOSS if patches else STATUS_NO_CHANGE
        for ha, poly in patches[:MAX_POLYS_PER_PLOT]:
            wgs = mapping(from_crs(outline(poly), grid.crs))
            row["changes"].append(
                {"geometry": {"type": "Polygon", "coordinates": _round_coords(wgs["coordinates"])}, "areaHa": round(ha, 2)}
            )
        out.append(row)
    return out


@dataclass
class Composite:
    ndvi: np.ndarray
    ndmi: np.ndarray
    scenes: int
    first_at: int | None
    last_at: int | None


def thin(items: list[dict[str, Any]], n: int = MAX_COMPOSITE_SCENES) -> list[dict[str, Any]]:
    """Si hay más de `n` escenas, deja `n` repartidas parejo a lo largo de la estación."""
    if len(items) <= n:
        return items
    idx = np.unique(np.linspace(0, len(items) - 1, n).round().astype(int))
    return [items[i] for i in idx]


def median_composite(ndvi_stack: list[np.ndarray], ndmi_stack: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Mediana por píxel ignorando los NaN; con menos de MIN_OBS observaciones válidas el píxel queda sin dato."""
    nv, nm = np.stack(ndvi_stack), np.stack(ndmi_stack)
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        mv, mm = np.nanmedian(nv, axis=0), np.nanmedian(nm, axis=0)
    enough = np.isfinite(nv).sum(axis=0) >= MIN_OBS
    return np.where(enough, mv, np.nan), np.where(enough, mm, np.nan)


def scene_indices(item: dict[str, Any], grid: Grid) -> tuple[np.ndarray, np.ndarray]:
    """NDVI y NDMI de una escena con nubes, sombras y sus bordes enmascarados."""
    valid = scl_valid(item, grid)
    valid &= ~dilate(~valid, 2)  # come 2 px de borde de nubes
    red, nir, swir = (reflectance(item, b, grid) for b in ("red", "nir", "swir16"))
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
        ndmi = (nir - swir) / (nir + swir)
    ok = valid & np.isfinite(ndvi) & np.isfinite(ndmi) & (np.abs(ndvi) <= 1) & (np.abs(ndmi) <= 1)
    return np.where(ok, ndvi, np.nan).astype("float32"), np.where(ok, ndmi, np.nan).astype("float32")


def build_composite(farm: dict[str, Any], year: int, grid: Grid) -> Composite:
    start, end = dry_season(year)
    items = thin(search(farm_bbox(farm), start, end, MAX_SEARCH_CLOUD))
    if not items:
        raise RuntimeError(f"Sin escenas de Sentinel-2 en la estación seca {year}")
    ndvi_stack: list[np.ndarray] = []
    ndmi_stack: list[np.ndarray] = []
    for it in items:
        v, m = scene_indices(it, grid)
        ndvi_stack.append(v)
        ndmi_stack.append(m)
    ndvi, ndmi = median_composite(ndvi_stack, ndmi_stack)
    times = [_epoch_ms(i) for i in items]
    return Composite(ndvi, ndmi, len(items), min(times), max(times))


def eudr_analysis(api: IngestClient, farm: dict[str, Any], today: date | None = None) -> int:
    """Calcula y sube el resultado de cada lote de la estancia. Devuelve cuántos lotes se subieron."""
    cur_year = latest_dry_season_year(today or datetime.now(timezone.utc).date())
    geom = api.farm_geometry(farm["id"])
    if not geom["plots"]:
        return 0
    grid = make_grid(geom)
    ref = build_composite(farm, REF_YEAR, grid)
    cur = build_composite(farm, cur_year, grid)
    rows = analyze_plots((ref.ndvi, ref.ndmi), (cur.ndvi, cur.ndmi), grid)
    for r in rows:
        api.eudr_result(
            {
                **r,
                "refYear": REF_YEAR,
                "curYear": cur_year,
                "refFromAt": ref.first_at,
                "refToAt": ref.last_at,
                "curFromAt": cur.first_at,
                "curToAt": cur.last_at,
                "refScenes": ref.scenes,
                "curScenes": cur.scenes,
            }
        )
    log.info("EUDR %s: %d lotes, %d con posible pérdida", farm["name"], len(rows), sum(r["status"] == STATUS_LOSS for r in rows))
    return len(rows)
