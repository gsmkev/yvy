"""M-17: convierte los GeoTIFF que se subieron como capas propias (dron, mapa de suelos) a PNG en WGS84.

El Worker solo guarda el original en R2 (yvy-media, `layers/<org>/<id>/original.tif`). Acá se reproyecta a
EPSG:4326, se achica a un tamaño que el navegador dibuje bien y se sube `image.png` junto al original. El resultado
(ruta, bytes y 4 esquinas arriba-izq., arriba-der., abajo-der., abajo-izq.) vuelve por /ingest.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

log = logging.getLogger(__name__)

MAX_SIDE = 4096
DST_CRS = "EPSG:4326"


def _to_uint8(band: np.ndarray, valid: np.ndarray) -> np.ndarray:
    if band.dtype == np.uint8:
        return band
    v = band[valid]
    if v.size == 0:
        return np.zeros(band.shape, dtype="uint8")
    lo, hi = np.percentile(v, (2, 98))
    if hi <= lo:
        hi = lo + 1
    return np.clip((band.astype("float32") - lo) / (hi - lo) * 255, 0, 255).astype("uint8")


def geotiff_to_png(src_path: Path, dst_path: Path, max_side: int = MAX_SIDE) -> list[list[float]]:
    """Escribe un PNG RGBA en WGS84 y devuelve las 4 esquinas [lon, lat]. Falla si el archivo no está georreferenciado."""
    import rasterio
    import rasterio.transform
    from rasterio.enums import Resampling
    from rasterio.warp import calculate_default_transform, reproject

    with rasterio.open(src_path) as src:
        if src.crs is None:
            raise ValueError("el GeoTIFF no trae sistema de coordenadas")
        t0, w0, h0 = calculate_default_transform(src.crs, DST_CRS, src.width, src.height, *src.bounds)
        left, bottom, right, top = rasterio.transform.array_bounds(h0, w0, t0)
        scale = min(1.0, max_side / max(w0, h0))
        w, h = max(1, int(w0 * scale)), max(1, int(h0 * scale))
        transform = rasterio.transform.from_bounds(left, bottom, right, top, w, h)
        n = min(src.count, 3)
        idx = list(range(1, n + 1))
        out = np.zeros((n, h, w), dtype=src.dtypes[0])
        alpha = np.zeros((h, w), dtype="uint8")
        for i, b in enumerate(idx):
            reproject(
                rasterio.band(src, b),
                out[i],
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=transform,
                dst_crs=DST_CRS,
                resampling=Resampling.bilinear,
                src_nodata=src.nodata,
                dst_nodata=src.nodata,
            )
        # Transparente donde no hay dato: máscara del TIFF (alfa, nodata) reproyectada
        mask = src.dataset_mask()
        reproject(
            mask,
            alpha,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=transform,
            dst_crs=DST_CRS,
            resampling=Resampling.nearest,
        )
    valid = alpha > 0
    bands = [_to_uint8(out[i], valid) for i in range(n)]
    rgb = np.stack(bands * 3 if n == 1 else bands + ([bands[-1]] if n == 2 else []), axis=-1)[..., :3]
    Image.fromarray(np.dstack([rgb, alpha]), "RGBA").save(dst_path, optimize=True)
    return [[left, top], [right, top], [right, bottom], [left, bottom]]


def custom_layers(api: Any, farm: dict[str, Any], work_dir: Path | None = None) -> int:
    """Procesa los GeoTIFF pendientes de la estancia. Devuelve cuántos quedaron listos."""
    from tempfile import TemporaryDirectory

    from ..storage import download_media, upload_media

    done = 0
    with TemporaryDirectory() as tmp:
        base = work_dir or Path(tmp)
        for layer in api.custom_layers_pending(farm["id"]):
            src, dst = base / "original.tif", base / "image.png"
            try:
                download_media(layer["originalPath"], src)
                corners = geotiff_to_png(src, dst)
                key = layer["originalPath"].rsplit("/", 1)[0] + "/image.png"
                upload_media(dst, key, "image/png")
                api.custom_layer_result(
                    layer["id"],
                    {"status": "ready", "imagePath": key, "imageMime": "image/png", "bytes": dst.stat().st_size, "corners": corners},
                )
                done += 1
            except Exception:  # una capa que falla no frena a las demás
                log.exception("falló la capa %s", layer["id"])
                api.custom_layer_result(layer["id"], {"status": "failed"})
    return done
