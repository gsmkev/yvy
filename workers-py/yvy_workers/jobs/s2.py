"""Sentinel-2 L2A desde Earth Search (AWS Open Data, COG). PRD §12 s2_ingest / s2_basemap, RF-50..55.

Todo se lee sobre una grilla común: UTM local de la estancia a 10 m, recortada al bbox (+200 m).
Solo se bajan los bloques del COG que tocan la estancia.
"""

from __future__ import annotations

import logging
import tempfile
import time
import warnings
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from shapely.geometry.base import BaseGeometry

from ..geo import load, to_crs, utm_crs
from .problems import find_problem_areas
from ..ingest import IngestClient
from ..storage import upload_tiles
from .constants import BASEMAP_DAYS, DAILY_DAYS
from ..tiles import index_rgba, write_pmtiles

log = logging.getLogger(__name__)

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLLECTION = "sentinel-2-l2a"
SOURCE = "sentinel-2-l2a"
# SCL: 0 sin dato, 1 saturado, 3 sombra de nube, 8-9 nube, 10 cirros, 11 nieve (PRD §12)
SCL_INVALID = (0, 1, 3, 8, 9, 10, 11)
MIN_VALID_PCT = 60.0  # RF-51
MAX_SCENE_CLOUD = 80.0
RES = 10.0
MAX_ITEMS = 400  # 180 días x 2 satélites x hasta 3 teselas MGRS entran de sobra
THIN_PLOT_M = 30.0  # S-11: un lote más angosto que esto casi no tiene píxeles de 10 m "puros"
HISTORY_FIRST_YEAR = 2017  # S-03: primer año con Sentinel-2 completo (A y B)
INDICES = ("ndvi", "ndre", "ndmi", "evi")  # S-07
ATTRIBUTION = "Contiene datos modificados de Copernicus Sentinel"


@dataclass
class Grid:
    crs: Any
    transform: Any
    width: int
    height: int
    farm: BaseGeometry  # en crs
    plots: list[tuple[str, BaseGeometry]]  # en crs


# Mapa base con contexto: 3 km alrededor de la estancia (con 1 km una estancia chica se veía como un recorte aislado)
BASEMAP_BUFFER_M = 3000.0
BASEMAP_MARGIN_DEG = 0.03


def make_grid(geom: dict[str, Any], buffer_m: float = 200.0) -> Grid:
    farm_wgs = load(geom["farm"])
    crs = utm_crs(farm_wgs.centroid.x, farm_wgs.centroid.y)
    farm = to_crs(farm_wgs, crs)
    minx, miny, maxx, maxy = farm.buffer(buffer_m).bounds
    minx, maxy = np.floor(minx / RES) * RES, np.ceil(maxy / RES) * RES
    width = int(np.ceil((maxx - minx) / RES))
    height = int(np.ceil((maxy - miny) / RES))
    plots = [(p["id"], to_crs(load(p["geometry"]), crs)) for p in geom["plots"]]
    return Grid(crs=crs, transform=from_origin(minx, maxy, RES, RES), width=width, height=height, farm=farm, plots=plots)


def read_band(href: str, grid: Grid, resampling: Resampling = Resampling.bilinear) -> np.ndarray:
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2"):
        with rasterio.open(href) as src, WarpedVRT(
            src, crs=grid.crs, transform=grid.transform, width=grid.width, height=grid.height, resampling=resampling
        ) as vrt:
            return vrt.read(1)


def _scale(item: dict[str, Any], asset: str) -> tuple[float, float]:
    bands = item["assets"][asset].get("raster:bands") or [{}]
    scale = float(bands[0].get("scale", 0.0001))
    # Earth Search ya armoniza los COG (resta el +1000 de la línea base 04.00): no aplicar el offset dos veces.
    if item["properties"].get("earthsearch:boa_offset_applied"):
        return scale, 0.0
    return scale, float(bands[0].get("offset", 0.0))


def reflectance(item: dict[str, Any], asset: str, grid: Grid) -> np.ndarray:
    raw = read_band(item["assets"][asset]["href"], grid).astype("float32")
    scale, offset = _scale(item, asset)
    out = raw * scale + offset
    out[raw == 0] = np.nan
    return out


def scl_valid(item: dict[str, Any], grid: Grid) -> np.ndarray:
    scl = read_band(item["assets"]["scl"]["href"], grid, Resampling.nearest)
    return ~np.isin(scl, SCL_INVALID)


def dilate(mask: np.ndarray, px: int) -> np.ndarray:
    """Agranda una máscara booleana `px` píxeles (para comerse los bordes de nubes)."""
    out = mask.copy()
    for _ in range(px):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def compute_ndvi(red: np.ndarray, nir: np.ndarray, valid: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
    ok = valid & np.isfinite(ndvi) & (np.abs(ndvi) <= 1)
    return np.where(ok, ndvi, np.nan), ok


def is_thin(geom: BaseGeometry, width_m: float = THIN_PLOT_M) -> bool:
    """S-11: ¿el lote es más angosto que `width_m` en algún tramo? (geom en metros): si no sobrevive a un retroceso de medio ancho."""
    return geom.buffer(-width_m / 2).is_empty


def compute_indices(bands: dict[str, np.ndarray], valid: np.ndarray, wanted: tuple[str, ...] = INDICES) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Índices de vegetación de una escena (S-07). `bands` con reflectancia: red, nir, rededge1 (B05), nir08 (B8A),
    swir16 (B11) y blue. Cada índice devuelve (valores con NaN donde no vale, máscara válida).

    NDVI = (NIR - R) / (NIR + R)            vigor
    NDRE = (B8A - B05) / (B8A + B05)        nitrógeno / clorofila (borde rojo)
    NDMI = (NIR - SWIR1) / (NIR + SWIR1)    humedad de la vegetación
    EVI  = 2,5 (NIR - R) / (NIR + 6 R - 7,5 Azul + 1)   no se satura tanto con follaje denso
    """
    out: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    with np.errstate(divide="ignore", invalid="ignore"):
        for idx in wanted:
            if idx == "ndvi":
                v = (bands["nir"] - bands["red"]) / (bands["nir"] + bands["red"])
            elif idx == "ndre":
                v = (bands["nir08"] - bands["rededge1"]) / (bands["nir08"] + bands["rededge1"])
            elif idx == "ndmi":
                v = (bands["nir"] - bands["swir16"]) / (bands["nir"] + bands["swir16"])
            elif idx == "evi":
                v = 2.5 * (bands["nir"] - bands["red"]) / (bands["nir"] + 6 * bands["red"] - 7.5 * bands["blue"] + 1)
            else:
                raise ValueError(f"índice desconocido: {idx}")
            ok = valid & np.isfinite(v) & (np.abs(v) <= 1)
            out[idx] = (np.where(ok, v, np.nan).astype("float32"), ok)
    return out


def plot_stats(ndvi: np.ndarray, ok: np.ndarray, grid: Grid, idx: str = "ndvi") -> list[dict[str, Any]]:
    """Media, p10, p90 y % de píxeles válidos por lote. Descarta lotes con < 60 % válido (RF-51).

    Los lotes de menos de 30 m de ancho usan todos los píxeles que toca el polígono (si no, quedan sin ninguno) y
    se marcan `lowConfidence`: esos píxeles mezclan el lote con lo de al lado (S-11).
    """
    out = []
    for plot_id, geom in grid.plots:
        thin = is_thin(geom)
        inside = geometry_mask([geom], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True, all_touched=thin)
        total = int(inside.sum())
        if total == 0:
            continue
        vals = ndvi[inside & ok]
        valid_pct = 100.0 * vals.size / total
        if valid_pct < MIN_VALID_PCT or vals.size == 0:
            continue
        out.append(
            {
                "plotId": plot_id,
                "idx": idx,
                "lowConfidence": thin,
                "mean": round(float(np.mean(vals)), 4),
                "p10": round(float(np.percentile(vals, 10)), 4),
                "p90": round(float(np.percentile(vals, 90)), 4),
                "validPct": round(valid_pct, 1),
            }
        )
    return out


def search(bbox: list[float], start: datetime, end: datetime, max_cloud: float) -> list[dict[str, Any]]:
    from pystac_client import Client

    client = Client.open(STAC_URL)
    items = client.search(
        collections=[COLLECTION],
        bbox=bbox,
        datetime=f"{start.isoformat()}/{end.isoformat()}",
        query={"eo:cloud_cover": {"lt": max_cloud}},
        sortby=[{"field": "properties.datetime", "direction": "asc"}],
        max_items=MAX_ITEMS,
    ).item_collection_as_dict()["features"]
    return items


def _epoch_ms(item: dict[str, Any]) -> int:
    return int(datetime.fromisoformat(item["properties"]["datetime"].replace("Z", "+00:00")).timestamp() * 1000)


def farm_bbox(farm: dict[str, Any]) -> list[float]:
    return [farm["minLon"], farm["minLat"], farm["maxLon"], farm["maxLat"]]


def group_passes(items: list[dict[str, Any]]) -> list[tuple[str, list[dict[str, Any]]]]:
    """Agrupa las teselas MGRS de una misma pasada (fecha + satélite): una estancia puede caer en varias."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for it in items:
        key = f"{it['properties']['datetime'][:10]}_{it['properties'].get('platform', it['id'][:3])}"
        groups.setdefault(key, []).append(it)
    return sorted(groups.items())


BAND_FOR = {"ndvi": ("red", "nir"), "ndre": ("nir08", "rededge1"), "ndmi": ("nir", "swir16"), "evi": ("red", "nir", "blue")}


def mosaic_indices(items: list[dict[str, Any]], grid: Grid, wanted: tuple[str, ...] = INDICES) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Índices de la pasada: cada píxel toma la primera tesela con dato válido. Solo baja las bandas que hacen falta."""
    shape = (grid.height, grid.width)
    res = {i: (np.full(shape, np.nan, dtype="float32"), np.zeros(shape, dtype=bool)) for i in wanted}
    names = sorted({b for i in wanted for b in BAND_FOR[i]})
    for item in items:
        if all(ok.all() for _, ok in res.values()):
            break
        valid = scl_valid(item, grid)
        if not any(valid[~ok].any() for _, ok in res.values()):
            continue
        bands = {b: reflectance(item, b, grid) for b in names}
        for idx, (vals, o) in compute_indices(bands, valid, wanted).items():
            arr, ok = res[idx]
            take = o & ~ok
            arr[take] = vals[take]
            ok |= take
    return res


def mosaic_ndvi(items: list[dict[str, Any]], grid: Grid) -> tuple[np.ndarray, np.ndarray]:
    return mosaic_indices(items, grid, ("ndvi",))["ndvi"]


Latest = dict[str, tuple[int, np.ndarray, np.ndarray]]


def ingest_range(
    api: IngestClient,
    geom: dict[str, Any],
    grid: Grid,
    items: list[dict[str, Any]],
    indices: tuple[str, ...] = INDICES,
    farm_id: str = "",
) -> tuple[dict[str, int], Latest]:
    """Procesa las pasadas de `items` aún no procesadas: estadísticas por lote de cada índice. Devuelve también,
    por índice, la última pasada con >= 60 % de la estancia válida (para la capa del mapa)."""
    farm_mask = geometry_mask([grid.farm], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
    done = {"scenes": 0, "stats": 0}
    latest: Latest = {}
    for key, group in group_passes(items):
        acquired = _epoch_ms(group[0])
        cloud = float(np.mean([it["properties"].get("eo:cloud_cover", 0) for it in group]))
        # La marca de "procesada" es por estancia: la misma pasada cubre a varias y cada una necesita sus estadísticas
        scene = api.scene(SOURCE, f"{farm_id}:{key}" if farm_id else key, acquired, round(cloud, 1))
        if scene["processed"]:
            continue
        t0 = time.time()
        mosaics = mosaic_indices(group, grid, indices)
        stats: list[dict[str, Any]] = []
        for idx, (values, ok) in mosaics.items():
            stats += plot_stats(values, ok, grid, idx)
            if ok[farm_mask].mean() * 100 >= MIN_VALID_PCT:
                latest[idx] = (acquired, values, ok & farm_mask)
        for st in stats:
            st.update(sceneId=scene["id"], acquiredAt=acquired)
        if stats:
            done["stats"] += api.plot_index_stats(stats)
        api.scene_processed(scene["id"])
        done["scenes"] += 1
        log.info("pasada %s (%d teselas): %d filas, %.0f %% válido, %.1fs", key, len(group), len(stats), mosaics["ndvi"][1][farm_mask].mean() * 100 if "ndvi" in mosaics else 0, time.time() - t0)
    return done, latest


def s2_ingest(api: IngestClient, farm: dict[str, Any], days: int = DAILY_DAYS, upload: bool = True) -> dict[str, int]:
    """Procesa las pasadas nuevas de los últimos `days` días para una estancia."""
    end = datetime.now(timezone.utc)
    items = search(farm_bbox(farm), end - timedelta(days=days), end, MAX_SCENE_CLOUD)
    geom = api.farm_geometry(farm["id"])
    if not geom["plots"]:
        return {"scenes": 0, "stats": 0}
    grid = make_grid(geom)
    done, latest = ingest_range(api, geom, grid, items, farm_id=farm["id"])
    done["problems"] = 0
    if "ndvi" in latest:
        acquired, ndvi, valid = latest["ndvi"]
        done["problems"] = upload_problem_areas(api, grid, ndvi, valid, acquired)
    if upload:
        # NDVI siempre; NDRE, NDMI y EVI son capas opcionales del selector: si una falla no frena el resto (S-07)
        for idx in INDICES:
            if idx in latest:
                acquired, values, valid = latest[idx]
                try:
                    publish_layer(api, farm, grid, idx, acquired, index_rgba(values, valid, idx))
                except Exception:
                    if idx == "ndvi":
                        raise
                    log.exception("capa %s: falló", idx)
    return done


def s2_history(api: IngestClient, farm: dict[str, Any], first_year: int = HISTORY_FIRST_YEAR, today: date | None = None) -> dict[str, int]:
    """S-03: vigor (NDVI por lote) de todas las campañas desde 2017, a pedido. Año por año para no pasar de MAX_ITEMS.
    Idempotente: las pasadas ya procesadas se saltean. Sin capas ni áreas problema: solo la historia por lote."""
    now = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc) if today else datetime.now(timezone.utc)
    geom = api.farm_geometry(farm["id"])
    total = {"scenes": 0, "stats": 0}
    if not geom["plots"]:
        return total
    grid = make_grid(geom)
    for year in range(first_year, now.year + 1):
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = min(datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc), now)
        if start > end:
            break
        done, _ = ingest_range(api, geom, grid, search(farm_bbox(farm), start, end, MAX_SCENE_CLOUD), ("ndvi",), farm_id=farm["id"])
        total["scenes"] += done["scenes"]
        total["stats"] += done["stats"]
        log.info("historia %s %d: %s", farm["name"], year, done)
    return total


def upload_problem_areas(api: IngestClient, grid: Grid, ndvi: np.ndarray, ok: np.ndarray, acquired: int) -> int:
    """S-08: áreas muy por debajo de la mediana del lote en la última escena válida. Falla sin frenar el resto."""
    try:
        by_plot: dict[str, list[dict[str, Any]]] = {}
        for a in find_problem_areas(ndvi, ok, grid.plots, grid.transform, grid.crs, grid.width, grid.height):
            by_plot.setdefault(a["plotId"], []).append({k: v for k, v in a.items() if k != "plotId"})
        # También los lotes sin áreas: así se borran las de la escena anterior
        return sum(api.problem_areas(pid, acquired, by_plot.get(pid, [])) for pid, _ in grid.plots)
    except Exception:
        log.exception("áreas problema: falló")
        return 0


def s2_basemap(api: IngestClient, farm: dict[str, Any], days: int = BASEMAP_DAYS, upload: bool = True) -> int:
    """Compuesto mediana de color natural con baja nubosidad (RF-55). Devuelve bytes del PMTiles."""
    end = datetime.now(timezone.utc)
    items = search(farm_bbox(farm), end - timedelta(days=days), end, 30.0)[-12:]
    if not items:
        raise RuntimeError("Sin escenas con poca nubosidad en el período")
    grid = make_grid(api.farm_geometry(farm["id"]), buffer_m=BASEMAP_BUFFER_M)
    stacks: dict[str, list[np.ndarray]] = {"red": [], "green": [], "blue": []}
    raw: dict[str, list[np.ndarray]] = {"red": [], "green": [], "blue": []}
    for item in items:
        scl = read_band(item["assets"]["scl"]["href"], grid, Resampling.nearest)
        cloudy = dilate(np.isin(scl, (3, 8, 9, 10)), 4)  # bordes de nubes y sombras
        valid = ~np.isin(scl, SCL_INVALID) & ~cloudy
        for band in stacks:
            refl = reflectance(item, band, grid)
            stacks[band].append(np.where(valid, refl, np.nan))
            raw[band].append(refl)
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        clean = np.stack([np.nanmedian(np.stack(stacks[b]), axis=0) for b in ("red", "green", "blue")])
        fallback = np.stack([np.nanmedian(np.stack(raw[b]), axis=0) for b in ("red", "green", "blue")])
    rgb = np.where(np.isfinite(clean), clean, fallback)
    alpha = np.all(np.isfinite(rgb), axis=0)
    # Estiramiento simple 0-0,3 de reflectancia con gamma para que se vea natural
    img = np.clip(np.nan_to_num(rgb) / 0.3, 0, 1) ** (1 / 1.4) * 255
    rgba = np.concatenate([img.astype(np.uint8), np.where(alpha, 255, 0)[None].astype(np.uint8)])
    return publish_layer(api, farm, grid, "true_color", _epoch_ms(items[-1]), rgba, BASEMAP_MARGIN_DEG) if upload else 0


def publish_layer(
    api: IngestClient, farm: dict[str, Any], grid: Grid, layer: str, acquired: int, rgba: np.ndarray, margin_deg: float = 0.01
) -> int:
    bounds = (farm["minLon"] - margin_deg, farm["minLat"] - margin_deg, farm["maxLon"] + margin_deg, farm["maxLat"] + margin_deg)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{layer}.pmtiles"
        size = write_pmtiles(rgba, grid.transform, grid.crs, path, bounds, f"Yvy {layer}", ATTRIBUTION)
        key = f"farms/{farm['id']}/{layer}/{acquired}.pmtiles"
        upload_tiles(path, key)
    api.farm_layer(farmId=farm["id"], layer=layer, acquiredAt=acquired, pmtilesPath=key, bytes=size, bounds=list(bounds))
    log.info("capa %s de %s: %.1f MB", layer, farm["name"], size / 1e6)
    return size
