"""Sentinel-2 L2A desde Earth Search (AWS Open Data, COG). PRD §12 s2_ingest / s2_basemap, RF-50..55.

Todo se lee sobre una grilla común: UTM local de la estancia a 10 m, recortada al bbox (+200 m).
Solo se bajan los bloques del COG que tocan la estancia.
"""

from __future__ import annotations

import logging
import tempfile
import time
import warnings
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import rasterio.errors
from rasterio.enums import Resampling
from rasterio.features import geometry_mask

from ..ingest import IngestClient
from ..storage import upload_tiles
from ..tiles import index_rgba, write_pmtiles
from .constants import BASEMAP_DAYS, DAILY_DAYS
from .problems import find_problem_areas

# Los nombres que otros módulos y los tests importan de acá viven en s2_bands / s2_indices
from .s2_bands import (  # noqa: F401
    ATTRIBUTION,
    GAMMA,
    RES,
    SATURATION,
    SCL_INVALID,
    WHITE,
    Grid,
    _scale,
    dilate,
    make_grid,
    natural_color,
    read_band,
    reflectance,
    scl_valid,
)
from .s2_indices import (  # noqa: F401
    BAND_FOR,
    INDICES,
    MIN_VALID_PCT,
    THIN_PLOT_M,
    compute_indices,
    compute_ndvi,
    is_thin,
    mosaic_indices,
    mosaic_ndvi,
    plot_stats,
)

log = logging.getLogger(__name__)

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLLECTION = "sentinel-2-l2a"
SOURCE = "sentinel-2-l2a"
MAX_SCENE_CLOUD = 80.0
MAX_ITEMS = 400  # 180 días x 2 satélites x hasta 3 teselas MGRS entran de sobra
HISTORY_FIRST_YEAR = 2017  # S-03: primer año con Sentinel-2 completo (A y B)


# Mapa base con contexto: 3 km alrededor de la estancia (con 1 km una estancia chica se veía como un recorte aislado)
BASEMAP_BUFFER_M = 3000.0
BASEMAP_MARGIN_DEG = 0.03


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
        try:
            mosaics = mosaic_indices(group, grid, indices)
        except rasterio.errors.RasterioIOError:
            # Pasadas viejas del archivo público a veces no tienen alguna banda: se saltea sin marcarla procesada
            log.warning("pasada %s: falta un archivo en el origen, se saltea", key)
            continue
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
    rgba = natural_color(np.where(np.isfinite(clean), clean, fallback))
    return publish_layer(api, farm, grid, "true_color", _epoch_ms(items[-1]), rgba, BASEMAP_MARGIN_DEG) if upload else 0


def publish_layer(
    api: IngestClient, farm: dict[str, Any], grid: Grid, layer: str, acquired: int, rgba: np.ndarray, margin_deg: float = 0.01
) -> int:
    bounds = (farm["minLon"] - margin_deg, farm["minLat"] - margin_deg, farm["maxLon"] + margin_deg, farm["maxLat"] + margin_deg)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{layer}.pmtiles"
        # El mapa base se mira de cerca: más calidad WebP que los índices
        size = write_pmtiles(
            rgba, grid.transform, grid.crs, path, bounds, f"Yvy {layer}", ATTRIBUTION, quality=85 if layer == "true_color" else 75
        )
        key = f"farms/{farm['id']}/{layer}/{acquired}.pmtiles"
        upload_tiles(path, key)
    api.farm_layer(farmId=farm["id"], layer=layer, acquiredAt=acquired, pmtilesPath=key, bytes=size, bounds=list(bounds))
    log.info("capa %s de %s: %.1f MB", layer, farm["name"], size / 1e6)
    return size
