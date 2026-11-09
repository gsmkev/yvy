"""Geometría de estancias y lotes (WGS84 → UTM local para medir en metros)."""

from __future__ import annotations

import math

import numpy as np
from typing import Any

from pyproj import CRS, Transformer
import shapely
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry


def utm_crs(lon: float, lat: float) -> CRS:
    zone = int((lon + 180) // 6) + 1
    return CRS.from_epsg((32700 if lat < 0 else 32600) + zone)


def to_crs(geom: BaseGeometry, dst: CRS | str | int) -> BaseGeometry:
    t = Transformer.from_crs("EPSG:4326", dst, always_xy=True)
    return shapely.transform(geom, lambda xy: np.column_stack(t.transform(xy[:, 0], xy[:, 1])))


def load(geojson: dict[str, Any]) -> BaseGeometry:
    return shape(geojson)


def distance_km(geom_wgs84: BaseGeometry, lon: float, lat: float) -> float:
    """Distancia en km de un punto al perímetro de la estancia (0 si está adentro)."""
    crs = utm_crs(geom_wgs84.centroid.x, geom_wgs84.centroid.y)
    g = to_crs(geom_wgs84, crs)
    p = to_crs(shape({"type": "Point", "coordinates": [lon, lat]}), crs)
    return 0.0 if g.contains(p) else g.distance(p) / 1000


def bearing_deg(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Rumbo inicial de 1 a 2, en grados desde el norte."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360
