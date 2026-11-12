"""Ráster RGBA → PMTiles (teselas WebP, zoom 10-16) para el mapa web y el paquete offline."""

from __future__ import annotations

import io
import math
from pathlib import Path

import numpy as np
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from rasterio.io import MemoryFile
from rio_tiler.io import Reader
from rio_tiler.errors import TileOutsideBounds

MIN_ZOOM = 10
MAX_ZOOM = 16
NDVI_RAMP = ["#B5562E", "#D9A93A", "#C9C46A", "#7A9A3F", "#3F6B35"]


def _hex(c: str) -> tuple[int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def ndvi_rgba(ndvi: np.ndarray, valid: np.ndarray, lo: float = 0.1, hi: float = 0.9) -> np.ndarray:
    """Colorea NDVI con la rampa de vigor de la marca (interpolación lineal). Devuelve (4, h, w) uint8."""
    stops = np.array([_hex(c) for c in NDVI_RAMP], dtype=float)
    t = np.clip((np.nan_to_num(ndvi) - lo) / (hi - lo), 0, 1) * (len(stops) - 1)
    i = np.clip(np.floor(t).astype(int), 0, len(stops) - 2)
    f = (t - i)[..., None]
    rgb = stops[i] * (1 - f) + stops[i + 1] * f
    out = np.zeros((4, *ndvi.shape), dtype=np.uint8)
    out[:3] = np.moveaxis(rgb, -1, 0).astype(np.uint8)
    out[3] = np.where(valid, 255, 0)
    return out


# S-07: rangos y rampas por índice. NDRE y EVI usan la rampa de vigor; NDMI (humedad) va de trigo (seco) a cielo (húmedo).
NDMI_RAMP = ["#D9A93A", "#F1EEE4", "#8DB3C7"]
INDEX_STYLE: dict[str, tuple[list[str], float, float]] = {
    "ndvi": (NDVI_RAMP, 0.1, 0.9),
    "ndre": (NDVI_RAMP, 0.05, 0.6),
    "evi": (NDVI_RAMP, 0.05, 0.8),
    "ndmi": (NDMI_RAMP, -0.2, 0.6),
}


def index_rgba(values: np.ndarray, valid: np.ndarray, idx: str) -> np.ndarray:
    """Colorea cualquier índice de vegetación con su rampa y rango. Devuelve (4, h, w) uint8."""
    ramp, lo, hi = INDEX_STYLE[idx]
    stops = np.array([_hex(c) for c in ramp], dtype=float)
    t = np.clip((np.nan_to_num(values) - lo) / (hi - lo), 0, 1) * (len(stops) - 1)
    i = np.clip(np.floor(t).astype(int), 0, len(stops) - 2)
    f = (t - i)[..., None]
    rgb = stops[i] * (1 - f) + stops[i + 1] * f
    out = np.zeros((4, *values.shape), dtype=np.uint8)
    out[:3] = np.moveaxis(rgb, -1, 0).astype(np.uint8)
    out[3] = np.where(valid, 255, 0)
    return out


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def write_pmtiles(
    rgba: np.ndarray,
    transform,
    crs,
    out: Path,
    bounds: tuple[float, float, float, float],
    name: str,
    attribution: str,
    min_zoom: int = MIN_ZOOM,
    max_zoom: int = MAX_ZOOM,
    quality: int = 75,
) -> int:
    """Escribe un PMTiles con las teselas que cubren `bounds` (lon/lat). Devuelve bytes escritos."""
    count, h, w = rgba.shape
    profile = {"driver": "GTiff", "height": h, "width": w, "count": count, "dtype": "uint8", "crs": crs, "transform": transform}
    entries: list[tuple[int, bytes]] = []
    with MemoryFile() as mem:
        with mem.open(**profile) as ds:
            ds.write(rgba)
        with mem.open() as ds, Reader(None, dataset=ds) as reader:
            for z in range(min_zoom, max_zoom + 1):
                x0, y0 = lonlat_to_tile(bounds[0], bounds[3], z)
                x1, y1 = lonlat_to_tile(bounds[2], bounds[1], z)
                for x in range(x0, x1 + 1):
                    for y in range(y0, y1 + 1):
                        try:
                            img = reader.tile(x, y, z, indexes=(1, 2, 3, 4), resampling_method="bilinear" if z > 13 else "average")
                        except TileOutsideBounds:
                            continue
                        data = img.data
                        alpha = data[3]
                        if not alpha.any():
                            continue
                        buf = io.BytesIO()
                        Image.fromarray(np.moveaxis(data, 0, -1), "RGBA").save(buf, "WEBP", quality=quality, method=4)
                        entries.append((zxy_to_tileid(z, x, y), buf.getvalue()))
    entries.sort()
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        writer = Writer(f)
        for tile_id, data in entries:
            writer.write_tile(tile_id, data)
        writer.finalize(
            {
                "tile_type": TileType.WEBP,
                "tile_compression": Compression.NONE,
                "min_zoom": min_zoom,
                "max_zoom": max_zoom,
                "min_lon_e7": int(bounds[0] * 1e7),
                "min_lat_e7": int(bounds[1] * 1e7),
                "max_lon_e7": int(bounds[2] * 1e7),
                "max_lat_e7": int(bounds[3] * 1e7),
                "center_zoom": (min_zoom + max_zoom) // 2,
                "center_lon_e7": int((bounds[0] + bounds[2]) / 2 * 1e7),
                "center_lat_e7": int((bounds[1] + bounds[3]) / 2 * 1e7),
            },
            {"name": name, "attribution": attribution, "format": "webp"},
        )
    return out.stat().st_size
