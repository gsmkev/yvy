"""Áreas problema dentro del lote (S-08): píxeles de NDVI muy por debajo de la mediana del lote.

Un área es una región conexa de píxeles con NDVI < mediana del lote - 0,15 y al menos 0,5 ha. Se guardan
como polígonos chicos (WGS84) para marcarlos en el mapa y mandar a alguien a recorrer. Solo el lote con
al menos 60 % de píxeles válidos (RF-51) entra; sin eso, la mediana no es confiable.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from rasterio.features import geometry_mask, shapes
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

from ..geo import from_crs

DELTA = 0.15
MIN_HA = 0.5
MAX_PER_PLOT = 5
MIN_VALID_PCT = 60.0
SIMPLIFY_M = 8.0


def find_problem_areas(
    ndvi: np.ndarray,
    ok: np.ndarray,
    plots: list[tuple[str, BaseGeometry]],
    transform: Any,
    crs: Any,
    width: int,
    height: int,
    delta: float = DELTA,
    min_ha: float = MIN_HA,
) -> list[dict[str, Any]]:
    """Por cada lote (geometría en el CRS de la grilla) devuelve hasta MAX_PER_PLOT áreas, las más grandes primero."""
    out: list[dict[str, Any]] = []
    for plot_id, geom in plots:
        inside = geometry_mask([geom], out_shape=(height, width), transform=transform, invert=True)
        total = int(inside.sum())
        valid = inside & ok & np.isfinite(ndvi)
        if total == 0 or 100.0 * valid.sum() / total < MIN_VALID_PCT:
            continue
        median = float(np.median(ndvi[valid]))
        low = valid & (ndvi < median - delta)
        if not low.any():
            continue
        found: list[tuple[float, BaseGeometry]] = []
        for g, _ in shapes(low.astype("uint8"), mask=low, transform=transform, connectivity=8):
            poly = shape(g)
            ha = poly.area / 10_000
            if ha >= min_ha:
                found.append((ha, poly))
        found.sort(key=lambda x: -x[0])
        for ha, poly in found[:MAX_PER_PLOT]:
            simple = poly.simplify(SIMPLIFY_M)
            if simple.is_empty or simple.geom_type != "Polygon":
                simple = poly
            wgs = from_crs(simple, crs)
            point = from_crs(poly.representative_point(), crs)
            mean = float(np.mean(ndvi[geometry_mask([poly], out_shape=(height, width), transform=transform, invert=True) & valid]))
            out.append(
                {
                    "plotId": plot_id,
                    "geometry": mapping(wgs),
                    "areaHa": round(ha, 2),
                    "lon": round(point.x, 6),
                    "lat": round(point.y, 6),
                    "meanNdvi": round(mean, 3),
                    "plotMedianNdvi": round(median, 3),
                }
            )
    return out
