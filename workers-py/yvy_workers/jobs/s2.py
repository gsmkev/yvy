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
from datetime import datetime, timedelta, timezone
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
from ..ingest import IngestClient
from ..storage import upload_tiles
from ..tiles import ndvi_rgba, write_pmtiles

log = logging.getLogger(__name__)

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLLECTION = "sentinel-2-l2a"
SOURCE = "sentinel-2-l2a"
# SCL: 0 sin dato, 1 saturado, 3 sombra de nube, 8-9 nube, 10 cirros, 11 nieve (PRD §12)
SCL_INVALID = (0, 1, 3, 8, 9, 10, 11)
MIN_VALID_PCT = 60.0  # RF-51
MAX_SCENE_CLOUD = 80.0
RES = 10.0
ATTRIBUTION = "Contiene datos modificados de Copernicus Sentinel"


@dataclass
class Grid:
    crs: Any
    transform: Any
    width: int
    height: int
    farm: BaseGeometry  # en crs
    plots: list[tuple[str, BaseGeometry]]  # en crs


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


def plot_stats(ndvi: np.ndarray, ok: np.ndarray, grid: Grid) -> list[dict[str, Any]]:
    """Media, p10, p90 y % de píxeles válidos por lote. Descarta lotes con < 60 % válido (RF-51)."""
    out = []
    for plot_id, geom in grid.plots:
        inside = geometry_mask([geom], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True, all_touched=False)
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
                "idx": "ndvi",
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
        max_items=200,
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


def mosaic_ndvi(items: list[dict[str, Any]], grid: Grid) -> tuple[np.ndarray, np.ndarray]:
    """NDVI de la pasada: cada píxel toma la primera tesela con dato válido."""
    ndvi = np.full((grid.height, grid.width), np.nan, dtype="float32")
    ok = np.zeros((grid.height, grid.width), dtype=bool)
    for item in items:
        if ok.all():
            break
        valid = scl_valid(item, grid)
        if not valid[~ok].any():
            continue
        n, o = compute_ndvi(reflectance(item, "red", grid), reflectance(item, "nir", grid), valid)
        take = o & ~ok
        ndvi[take] = n[take]
        ok |= take
    return ndvi, ok


def s2_ingest(api: IngestClient, farm: dict[str, Any], days: int = 10, upload: bool = True) -> dict[str, int]:
    """Procesa las pasadas nuevas de los últimos `days` días para una estancia."""
    end = datetime.now(timezone.utc)
    items = search(farm_bbox(farm), end - timedelta(days=days), end, MAX_SCENE_CLOUD)
    geom = api.farm_geometry(farm["id"])
    if not geom["plots"]:
        return {"scenes": 0, "stats": 0}
    grid = make_grid(geom)
    farm_mask = geometry_mask([grid.farm], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
    done = {"scenes": 0, "stats": 0}
    latest_layer: tuple[int, np.ndarray, np.ndarray] | None = None
    for key, group in group_passes(items):
        acquired = _epoch_ms(group[0])
        cloud = float(np.mean([it["properties"].get("eo:cloud_cover", 0) for it in group]))
        scene = api.scene(SOURCE, key, acquired, round(cloud, 1))
        if scene["processed"]:
            continue
        t0 = time.time()
        ndvi, ok = mosaic_ndvi(group, grid)
        stats = plot_stats(ndvi, ok, grid)
        for st in stats:
            st.update(sceneId=scene["id"], acquiredAt=acquired)
        if stats:
            done["stats"] += api.plot_index_stats(stats)
        if ok[farm_mask].mean() * 100 >= MIN_VALID_PCT:
            latest_layer = (acquired, ndvi, ok & farm_mask)
        api.scene_processed(scene["id"])
        done["scenes"] += 1
        log.info("pasada %s (%d teselas): %d lotes, %.0f %% válido, %.1fs", key, len(group), len(stats), ok[farm_mask].mean() * 100, time.time() - t0)
    if latest_layer and upload:
        acquired, ndvi, valid = latest_layer
        publish_layer(api, farm, grid, "ndvi", acquired, ndvi_rgba(ndvi, valid))
    return done


def s2_basemap(api: IngestClient, farm: dict[str, Any], days: int = 90, upload: bool = True) -> int:
    """Compuesto mediana de color natural con baja nubosidad (RF-55). Devuelve bytes del PMTiles."""
    end = datetime.now(timezone.utc)
    items = search(farm_bbox(farm), end - timedelta(days=days), end, 30.0)[-12:]
    if not items:
        raise RuntimeError("Sin escenas con poca nubosidad en el período")
    grid = make_grid(api.farm_geometry(farm["id"]), buffer_m=1000.0)
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
    return publish_layer(api, farm, grid, "true_color", _epoch_ms(items[-1]), rgba) if upload else 0


def publish_layer(api: IngestClient, farm: dict[str, Any], grid: Grid, layer: str, acquired: int, rgba: np.ndarray) -> int:
    bounds = (farm["minLon"] - 0.01, farm["minLat"] - 0.01, farm["maxLon"] + 0.01, farm["maxLat"] + 0.01)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{layer}.pmtiles"
        size = write_pmtiles(rgba, grid.transform, grid.crs, path, bounds, f"Yvy {layer}", ATTRIBUTION)
        key = f"farms/{farm['id']}/{layer}/{acquired}.pmtiles"
        upload_tiles(path, key)
    api.farm_layer(farmId=farm["id"], layer=layer, acquiredAt=acquired, pmtilesPath=key, bytes=size, bounds=list(bounds))
    log.info("capa %s de %s: %.1f MB", layer, farm["name"], size / 1e6)
    return size
