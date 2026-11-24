"""Sentinel-2: grilla común, lectura de bandas COG, reflectancia, máscara SCL y color natural."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from shapely.geometry.base import BaseGeometry

from ..geo import load, to_crs, utm_crs

# SCL: 0 sin dato, 1 saturado, 3 sombra de nube, 8-9 nube, 10 cirros, 11 nieve
SCL_INVALID = (0, 1, 3, 8, 9, 10, 11)
RES = 10.0
ATTRIBUTION = "Contiene datos modificados de Copernicus Sentinel"


@dataclass
class Grid:
    """Grilla común de trabajo de una estancia.

    Attributes:
        crs: UTM local.
        transform: Transformación afín (píxeles de 10 m).
        width: Ancho en píxeles.
        height: Alto en píxeles.
        farm: Perímetro de la estancia en `crs`.
        plots: Pares (id, geometría) de los lotes en `crs`.
    """
    crs: Any
    transform: Any
    width: int
    height: int
    farm: BaseGeometry  # en crs
    plots: list[tuple[str, BaseGeometry]]  # en crs


def make_grid(geom: dict[str, Any], buffer_m: float = 200.0) -> Grid:
    """Arma la grilla de la estancia: UTM local a 10 m sobre su bbox más un margen.

    Args:
        geom: Respuesta de ``farm_geometry`` (``farm`` y ``plots``).
        buffer_m: Margen alrededor del bbox, en metros.
    """
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
    """Lee una banda COG remuestreada a la grilla.

    Args:
        href: URL del COG.
        grid: Grilla de destino.
        resampling: Método de remuestreo.
    """
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
    """Reflectancia (0-1) de una banda sobre la grilla; NaN donde no hay dato."""
    raw = read_band(item["assets"][asset]["href"], grid).astype("float32")
    scale, offset = _scale(item, asset)
    out = raw * scale + offset
    out[raw == 0] = np.nan
    return out


def scl_valid(item: dict[str, Any], grid: Grid) -> np.ndarray:
    """Máscara de píxeles sin nube, sombra, nieve ni saturación según la banda SCL."""
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


# Color natural: reflectancia → sRGB. Curva compartida por el mapa base de cada estancia y el del país.
WHITE = 0.25  # reflectancia que llega a blanco (0,3 dejaba el campo apagado)
GAMMA = 1.6
SATURATION = 1.25  # Sentinel-2 en color verdadero sale grisáceo por la atmósfera


def natural_color(rgb: np.ndarray, white: float = WHITE, gamma: float = GAMMA, saturation: float = SATURATION) -> np.ndarray:
    """(3, h, w) reflectancia con NaN sin dato → (4, h, w) uint8 RGBA."""
    ok = np.all(np.isfinite(rgb), axis=0)
    x = np.clip(np.nan_to_num(rgb) / white, 0, 1) ** (1 / gamma)
    lum = 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2]
    x = np.clip(lum + (x - lum) * saturation, 0, 1)
    out = np.zeros((4, *rgb.shape[1:]), dtype=np.uint8)
    out[:3] = (x * 255).round().astype(np.uint8)
    out[3] = np.where(ok, 255, 0)
    return out
