"""Mapa base de todo Paraguay en color natural con Sentinel-2 (fondo antes de crear la primera estancia).

Sin este fondo, una cuenta nueva ve el mapa en negro: el mapa base de 10 m solo existe para estancias ya creadas.
Se arma por bloques de 1° leyendo las vistas reducidas (overviews) de los COG, a ~160 m por píxel, con la mediana
de las escenas menos nubladas de cada tesela MGRS. Se publica una vez en `base/paraguay.pmtiles` (zoom 4 a 11).
"""

from __future__ import annotations

import logging
import tempfile
import warnings
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from ..storage import upload_tiles
from ..tiles import write_pmtiles
from .s2 import ATTRIBUTION, SCL_INVALID, _scale, dilate, search

log = logging.getLogger(__name__)

# Paraguay con un margen chico de los países vecinos
BBOX = (-62.7, -27.65, -54.2, -19.25)
RES_DEG = 0.0015  # ~160 m
CHUNK_DEG = 1.0
DAYS = 150
MAX_CLOUD = 20.0
PER_TILE = 3  # escenas por tesela MGRS
MIN_ZOOM, MAX_ZOOM = 4, 11
KEY = "base/paraguay.pmtiles"
WORKERS = 6
# Nivel de overview que deja cada banda cerca de 160 m: 10 m → nivel 3 (1/16), 20 m (SCL) → nivel 2 (1/8)
OVERVIEW = {"red": 3, "green": 3, "blue": 3, "scl": 2}


def chunks(bbox: tuple[float, float, float, float] = BBOX, size: float = CHUNK_DEG) -> list[tuple[float, float, float, float]]:
    out = []
    lon = bbox[0]
    while lon < bbox[2] - 1e-9:
        lat = bbox[1]
        while lat < bbox[3] - 1e-9:
            out.append((lon, lat, min(lon + size, bbox[2]), min(lat + size, bbox[3])))
            lat += size
        lon += size
    return out


def mgrs(item: dict[str, Any]) -> str:
    p = item["properties"]
    return str(p.get("grid:code") or p.get("s2:mgrs_tile") or item["id"].split("_")[1])


def pick(items: list[dict[str, Any]], per_tile: int = PER_TILE) -> list[dict[str, Any]]:
    """Las `per_tile` escenas menos nubladas de cada tesela MGRS."""
    by: dict[str, list[dict[str, Any]]] = {}
    for it in items:
        by.setdefault(mgrs(it), []).append(it)
    out: list[dict[str, Any]] = []
    for group in by.values():
        out += sorted(group, key=lambda i: i["properties"].get("eo:cloud_cover", 100))[:per_tile]
    return out


def _read(href: str, transform: Any, w: int, h: int, level: int, resampling: Resampling) -> np.ndarray:
    env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2")
    with env:
        try:
            src = rasterio.open(href, overview_level=level)
        except RasterioIOError:  # COG sin ese nivel de overview
            src = rasterio.open(href)
        with src, WarpedVRT(src, crs="EPSG:4326", transform=transform, width=w, height=h, resampling=resampling) as vrt:
            return vrt.read(1)


def composite(items: list[dict[str, Any]], transform: Any, w: int, h: int) -> np.ndarray:
    """Mediana RGB sin nubes (con la mediana sin máscara de respaldo). Devuelve (4, h, w) uint8."""
    clean: dict[str, list[np.ndarray]] = {"red": [], "green": [], "blue": []}
    raw: dict[str, list[np.ndarray]] = {"red": [], "green": [], "blue": []}
    for item in items:
        try:
            scl = _read(item["assets"]["scl"]["href"], transform, w, h, OVERVIEW["scl"], Resampling.nearest)
            cloudy = dilate(np.isin(scl, (3, 8, 9, 10)), 1)
            valid = ~np.isin(scl, SCL_INVALID) & ~cloudy
            for band in clean:
                dn = _read(item["assets"][band]["href"], transform, w, h, OVERVIEW[band], Resampling.average).astype("float32")
                scale, offset = _scale(item, band)
                refl = np.where(dn == 0, np.nan, dn * scale + offset)
                clean[band].append(np.where(valid, refl, np.nan))
                raw[band].append(refl)
        except Exception:
            log.warning("escena %s: no se pudo leer", item.get("id"), exc_info=True)
    out = np.zeros((4, h, w), dtype=np.uint8)
    if not raw["red"]:
        return out
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        c = np.stack([np.nanmedian(np.stack(clean[b]), axis=0) for b in ("red", "green", "blue")])
        f = np.stack([np.nanmedian(np.stack(raw[b]), axis=0) for b in ("red", "green", "blue")])
    rgb = np.where(np.isfinite(c), c, f)
    ok = np.all(np.isfinite(rgb), axis=0)
    out[:3] = (np.clip(np.nan_to_num(rgb) / 0.3, 0, 1) ** (1 / 1.4) * 255).astype(np.uint8)
    out[3] = np.where(ok, 255, 0)
    return out


def country_basemap(days: int = DAYS, upload: bool = True) -> int:
    """Arma y publica el mapa base del país. Devuelve los bytes del PMTiles."""
    w = round((BBOX[2] - BBOX[0]) / RES_DEG)
    h = round((BBOX[3] - BBOX[1]) / RES_DEG)
    rgba = np.zeros((4, h, w), dtype=np.uint8)
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)

    def run(c: tuple[float, float, float, float]) -> None:
        col = round((c[0] - BBOX[0]) / RES_DEG)
        row = round((BBOX[3] - c[3]) / RES_DEG)
        cw = round((c[2] - c[0]) / RES_DEG)
        ch = round((c[3] - c[1]) / RES_DEG)
        items = pick(search(list(c), start, end, MAX_CLOUD))
        if not items:
            log.warning("bloque %s: sin escenas", c)
            return
        rgba[:, row : row + ch, col : col + cw] = composite(items, from_origin(c[0], c[3], RES_DEG, RES_DEG), cw, ch)
        log.info("bloque %s: %d escenas", c, len(items))

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(run, chunks()))
    if not rgba[3].any():
        raise RuntimeError("Mapa base del país vacío: no se leyó ninguna escena")
    if not upload:
        return 0
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "paraguay.pmtiles"
        size = write_pmtiles(rgba, from_origin(BBOX[0], BBOX[3], RES_DEG, RES_DEG), "EPSG:4326", path, BBOX, "Yvy Paraguay", ATTRIBUTION, MIN_ZOOM, MAX_ZOOM, quality=70)
        # Clave fija que se reemplaza cada trimestre: caché de un día, no inmutable
        upload_tiles(path, KEY, "public, max-age=86400")
    log.info("mapa base del país: %.1f MB", size / 1e6)
    return size
