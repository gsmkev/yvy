"""Mapa base de todo Paraguay en color natural con Sentinel-2 (fondo antes de crear la primera estancia).

Sin este fondo, una cuenta nueva ve el mapa en negro: el mapa base de 10 m solo existe para estancias ya creadas.

Se arma por bloques del tamaño de una tesela z10 (~39 km), cada uno a la resolución de z13 (2048 px, ~18 m en el
terreno) leyendo la primera overview (20 m) de los COG. Cada bloque es la mediana sin nubes de las escenas menos
nubladas de cada tesela MGRS. Las teselas z13 a z10 salen del bloque; z9 a z4 se arman juntando las z10.
Todo se escribe a disco a medida que sale (el país a 20 m no entra en memoria) y al final se arma un solo PMTiles
en `base/paraguay.pmtiles`: ~1,5 GB, bien dentro de los 10 GB gratis de R2.
"""

from __future__ import annotations

import io
import logging
import math
import tempfile
import warnings
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from ..storage import upload_tiles
from .s2 import ATTRIBUTION, SCL_INVALID, _scale, dilate, natural_color, search

log = logging.getLogger(__name__)

# Paraguay con un margen chico de los países vecinos
BBOX = (-62.7, -27.65, -54.2, -19.25)
BLOCK_Z = 10  # cada bloque es una tesela z10
MIN_ZOOM, MAX_ZOOM = 4, 13
BLOCK_PX = 256 * 2 ** (MAX_ZOOM - BLOCK_Z)  # 2048
DAYS = 150
MAX_CLOUD = 20.0
PER_TILE = 3  # escenas por tesela MGRS
KEY = "base/paraguay.pmtiles"
WORKERS = 6
QUALITY = 80
# Overview que deja cada banda cerca de los ~19 m de z13: 10 m → nivel 0 (1/2); SCL ya es de 20 m (sin overview)
OVERVIEW: dict[str, int | None] = {"red": 0, "green": 0, "blue": 0, "scl": None}
HALF = 20037508.342789244  # medio ancho del mundo en Web Mercator (m)


def tile_bounds_3857(x: int, y: int, z: int) -> tuple[float, float, float, float]:
    size = 2 * HALF / 2**z
    return (-HALF + x * size, HALF - (y + 1) * size, -HALF + (x + 1) * size, HALF - y * size)


def lonlat_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def blocks(bbox: tuple[float, float, float, float] = BBOX, z: int = BLOCK_Z) -> list[tuple[int, int]]:
    x0, y0 = lonlat_tile(bbox[0], bbox[3], z)
    x1, y1 = lonlat_tile(bbox[2], bbox[1], z)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def tile_lonlat_bbox(x: int, y: int, z: int) -> list[float]:
    n = 2**z

    def lat(yy: int) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))

    return [x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)]


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


def _read(href: str, transform: Any, w: int, h: int, level: int | None, resampling: Resampling) -> np.ndarray:
    env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2")
    with env:
        src = None
        if level is not None:
            try:
                src = rasterio.open(href, overview_level=level)
            except RasterioIOError:  # COG sin ese nivel de overview
                src = None
        src = src or rasterio.open(href)
        with src, WarpedVRT(src, crs="EPSG:3857", transform=transform, width=w, height=h, resampling=resampling) as vrt:
            return vrt.read(1)


def composite(items: list[dict[str, Any]], transform: Any, w: int, h: int) -> np.ndarray:
    """Mediana RGB sin nubes (con la mediana sin máscara de respaldo). Devuelve (4, h, w) uint8.

    Banda por banda para no tener las tres pilas en memoria a la vez (2048² x 12 escenas por banda).
    """
    ok_items: list[dict[str, Any]] = []
    masks: list[np.ndarray] = []
    for item in items:
        try:
            scl = _read(item["assets"]["scl"]["href"], transform, w, h, OVERVIEW["scl"], Resampling.nearest)
        except Exception:
            log.warning("escena %s: no se pudo leer la máscara", item.get("id"), exc_info=True)
            continue
        masks.append(~np.isin(scl, SCL_INVALID) & ~dilate(np.isin(scl, (3, 8, 9, 10)), 2))
        ok_items.append(item)
    if not ok_items:
        return np.zeros((4, h, w), dtype=np.uint8)
    rgb = np.full((3, h, w), np.nan, dtype="float32")
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        for b, band in enumerate(("red", "green", "blue")):
            stack = np.full((len(ok_items), h, w), np.nan, dtype="float32")
            for i, item in enumerate(ok_items):
                try:
                    dn = _read(item["assets"][band]["href"], transform, w, h, OVERVIEW[band], Resampling.average).astype("float32")
                except Exception:
                    log.warning("escena %s: no se pudo leer %s", item.get("id"), band, exc_info=True)
                    continue
                scale, offset = _scale(item, band)
                stack[i] = np.where(dn == 0, np.nan, dn * scale + offset)
            raw = np.nanmedian(stack, axis=0)
            for i, m in enumerate(masks):
                stack[i][~m] = np.nan
            clean = np.nanmedian(stack, axis=0)
            rgb[b] = np.where(np.isfinite(clean), clean, raw)
            del stack
    return natural_color(rgb)


def downsample(img: np.ndarray) -> np.ndarray:
    """(4, h, w) → (4, h/2, w/2): promedio del color de los píxeles con dato; alfa si al menos la mitad tiene dato."""
    a = img[3].astype("float32") / 255
    _, h, w = img.shape
    wsum = a.reshape(h // 2, 2, w // 2, 2).sum(axis=(1, 3))
    out = np.zeros((4, h // 2, w // 2), dtype=np.uint8)
    for k in range(3):
        v = (img[k].astype("float32") * a).reshape(h // 2, 2, w // 2, 2).sum(axis=(1, 3))
        out[k] = np.where(wsum > 0, v / np.maximum(wsum, 1e-6), 0).round().astype(np.uint8)
    out[3] = np.where(wsum >= 2, 255, 0)
    return out


def encode(tile: np.ndarray, quality: int = QUALITY) -> bytes | None:
    if not tile[3].any():
        return None
    buf = io.BytesIO()
    Image.fromarray(np.moveaxis(tile, 0, -1), "RGBA").save(buf, "WEBP", quality=quality, method=4)
    return buf.getvalue()


def cut(img: np.ndarray, x0: int, y0: int, z: int, out: Path) -> None:
    """Corta una imagen alineada a la grilla de teselas (esquina x0, y0 en el zoom z) y guarda cada tesela."""
    n = img.shape[1] // 256
    for dy in range(n):
        for dx in range(n):
            data = encode(img[:, dy * 256 : (dy + 1) * 256, dx * 256 : (dx + 1) * 256])
            if data:
                (out / f"{zxy_to_tileid(z, x0 + dx, y0 + dy)}.webp").write_bytes(data)


def pyramid(z10: dict[tuple[int, int], np.ndarray], out: Path) -> None:
    """Arma z9..z4 juntando de a 4 teselas hijas y reduciendo a la mitad."""
    level = z10
    for z in range(BLOCK_Z - 1, MIN_ZOOM - 1, -1):
        parents: dict[tuple[int, int], np.ndarray] = {}
        for x, y in {(x // 2, y // 2) for x, y in level}:
            big = np.zeros((4, 512, 512), dtype=np.uint8)
            for dx in (0, 1):
                for dy in (0, 1):
                    child = level.get((2 * x + dx, 2 * y + dy))
                    if child is not None:
                        big[:, dy * 256 : (dy + 1) * 256, dx * 256 : (dx + 1) * 256] = child
            parents[(x, y)] = downsample(big)
            cut(parents[(x, y)], x, y, z, out)
        level = parents


def build_block(x: int, y: int, start: datetime, end: datetime, out: Path) -> np.ndarray | None:
    """Arma un bloque z10, guarda sus teselas z13..z10 y devuelve la z10 (para la pirámide)."""
    items = pick(search(tile_lonlat_bbox(x, y, BLOCK_Z), start, end, MAX_CLOUD))
    if not items:
        log.warning("bloque %d/%d: sin escenas", x, y)
        return None
    b = tile_bounds_3857(x, y, BLOCK_Z)
    res = (b[2] - b[0]) / BLOCK_PX
    img = composite(items, from_origin(b[0], b[3], res, res), BLOCK_PX, BLOCK_PX)
    for z in range(MAX_ZOOM, BLOCK_Z - 1, -1):
        k = 2 ** (z - BLOCK_Z)
        cut(img, x * k, y * k, z, out)
        if z > BLOCK_Z:
            img = downsample(img)
    log.info("bloque %d/%d: %d escenas", x, y, len(items))
    return img


def write_archive(tiles_dir: Path, path: Path) -> int:
    ids = sorted(int(p.stem) for p in tiles_dir.glob("*.webp"))
    with open(path, "wb") as f:
        writer = Writer(f)
        for tid in ids:
            writer.write_tile(tid, (tiles_dir / f"{tid}.webp").read_bytes())
        writer.finalize(
            {
                "tile_type": TileType.WEBP,
                "tile_compression": Compression.NONE,
                "min_zoom": MIN_ZOOM,
                "max_zoom": MAX_ZOOM,
                "min_lon_e7": int(BBOX[0] * 1e7),
                "min_lat_e7": int(BBOX[1] * 1e7),
                "max_lon_e7": int(BBOX[2] * 1e7),
                "max_lat_e7": int(BBOX[3] * 1e7),
                "center_zoom": 6,
                "center_lon_e7": int((BBOX[0] + BBOX[2]) / 2 * 1e7),
                "center_lat_e7": int((BBOX[1] + BBOX[3]) / 2 * 1e7),
            },
            {"name": "Yvy Paraguay", "attribution": ATTRIBUTION, "format": "webp"},
        )
    return path.stat().st_size


def country_basemap(
    days: int = DAYS, upload: bool = True, only: list[tuple[int, int]] | None = None, workdir: Path | None = None
) -> int:
    """Arma y publica el mapa base del país. Devuelve los bytes del PMTiles."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    with tempfile.TemporaryDirectory() as tmp:
        root = workdir or Path(tmp)
        tiles_dir = root / "tiles"
        tiles_dir.mkdir(parents=True, exist_ok=True)
        todo = only or blocks()
        z10: dict[tuple[int, int], np.ndarray] = {}

        def run(xy: tuple[int, int]) -> None:
            try:
                img = build_block(xy[0], xy[1], start, end, tiles_dir)
            except Exception:
                log.exception("bloque %d/%d: falló", *xy)
                return
            if img is not None:
                z10[xy] = img

        with ThreadPoolExecutor(WORKERS) as pool:
            list(pool.map(run, todo))
        if not z10:
            raise RuntimeError("Mapa base del país vacío: no se leyó ninguna escena")
        log.info("%d de %d bloques con imagen", len(z10), len(todo))
        pyramid(z10, tiles_dir)
        path = root / "paraguay.pmtiles"
        size = write_archive(tiles_dir, path)
        if upload:
            # Clave fija que se reemplaza cada trimestre: caché de un día, no inmutable
            upload_tiles(path, KEY, "public, max-age=86400")
    log.info("mapa base del país: %.1f MB", size / 1e6)
    return size
