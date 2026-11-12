"""Mapas de fertilidad interpolados (A-31): pH, fósforo, potasio y materia orgánica a partir de los análisis de suelo con punto.

Los puntos vienen del Worker (`/ingest/farms/:id/soil-points`: solo los análisis con coordenadas). Por parámetro se
interpola por IDW (ponderación por la inversa de la distancia al cuadrado, con los 12 vecinos más cercanos) sobre la
grilla de 10 m, solo dentro de los lotes y a menos de MAX_DIST_M del punto más cercano: más lejos no se inventa un valor.
Cada parámetro necesita al menos MIN_POINTS puntos distintos; con menos no se publica nada (la web lo explica).
El resultado se publica como capa PMTiles con `publish_layer`, igual que los índices de vegetación.

Pesado: corre a pedido desde la web (dispatch) o a mano en GitHub Actions, nunca en el Worker.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import numpy as np
from pyproj import Transformer
from rasterio.features import geometry_mask

from ..ingest import IngestClient
from ..tiles import index_rgba

log = logging.getLogger(__name__)

# Mismos valores que LIMITS.fertility en packages/shared/src/limits.ts
MIN_POINTS = 8
POWER = 2.0
NEIGHBORS = 12
MAX_DIST_M = 1500.0
CHUNK = 20_000

# capa -> campo del análisis de suelo
PARAMS: dict[str, str] = {"fert_ph": "ph", "fert_p": "pMgKg", "fert_k": "kCmolKg", "fert_om": "omPct"}


def dedupe_points(points: list[dict[str, Any]], field: str) -> list[tuple[float, float, float]]:
    """Un valor por ubicación (lon/lat a 5 decimales, ~1 m): el del análisis más reciente. Descarta los que no traen el campo."""
    latest: dict[tuple[float, float], tuple[str, float]] = {}
    for p in points:
        v = p.get(field)
        if v is None or p.get("lon") is None or p.get("lat") is None or not np.isfinite(v):
            continue
        key = (round(float(p["lon"]), 5), round(float(p["lat"]), 5))
        day = str(p.get("sampledOn") or "")
        if key not in latest or day >= latest[key][0]:
            latest[key] = (day, float(v))
    return [(k[0], k[1], v[1]) for k, v in latest.items()]


def idw(xy: np.ndarray, values: np.ndarray, query: np.ndarray, power: float = POWER, k: int = NEIGHBORS, max_dist: float = MAX_DIST_M) -> np.ndarray:
    """IDW de los k vecinos más cercanos. xy (n, 2) y query (m, 2) en metros; NaN donde el punto más cercano está a más de max_dist."""
    out = np.full(len(query), np.nan, dtype="float64")
    k = min(k, len(xy))
    for s in range(0, len(query), CHUNK):
        q = query[s : s + CHUNK]
        d = np.sqrt(((q[:, None, :] - xy[None, :, :]) ** 2).sum(axis=2))
        idx = np.argpartition(d, k - 1, axis=1)[:, :k]
        dk = np.take_along_axis(d, idx, axis=1)
        vk = values[idx]
        exact = dk < 1e-6
        w = 1.0 / np.maximum(dk, 1e-6) ** power
        res = (w * vk).sum(axis=1) / w.sum(axis=1)
        has_exact = exact.any(axis=1)
        res[has_exact] = (vk * exact)[has_exact].sum(axis=1) / exact[has_exact].sum(axis=1)
        res[d.min(axis=1) > max_dist] = np.nan
        out[s : s + CHUNK] = res
    return out


def interpolate(grid: Any, inside: np.ndarray, pts: list[tuple[float, float, float]]) -> np.ndarray:
    """Superficie (alto, ancho) con NaN fuera de los lotes y lejos de los puntos."""
    t = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True)
    px, py = t.transform([p[0] for p in pts], [p[1] for p in pts])
    xy = np.column_stack([px, py]).astype("float64")
    values = np.array([p[2] for p in pts], dtype="float64")
    rows, cols = np.nonzero(inside)
    tr = grid.transform  # grilla norte arriba: sin rotación
    cx = tr.a * (cols + 0.5) + tr.c
    cy = tr.e * (rows + 0.5) + tr.f
    out = np.full(inside.shape, np.nan, dtype="float32")
    out[rows, cols] = idw(xy, values, np.column_stack([cx, cy]))
    return out


def fertility_maps(api: IngestClient, farm: dict[str, Any], now_ms: int | None = None) -> dict[str, int]:
    """Publica una capa por parámetro con puntos suficientes. Devuelve {capa: puntos usados} de las publicadas."""
    from .s2 import make_grid, publish_layer  # importa rasterio/rio-tiler recién acá

    points = api.soil_points(farm["id"])
    todo = {layer: dedupe_points(points, field) for layer, field in PARAMS.items()}
    ready = {layer: p for layer, p in todo.items() if len(p) >= MIN_POINTS}
    for layer, p in todo.items():
        if layer not in ready:
            log.info("%s: %s con %d puntos (mínimo %d), sin mapa", farm["name"], layer, len(p), MIN_POINTS)
    if not ready:
        return {}
    geom = api.farm_geometry(farm["id"])
    if not geom["plots"]:
        return {}
    grid = make_grid(geom)
    inside = geometry_mask([g for _, g in grid.plots], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
    acquired = now_ms or int(time.time() * 1000)
    done: dict[str, int] = {}
    for layer, p in ready.items():
        surface = interpolate(grid, inside, p)
        valid = np.isfinite(surface)
        if not valid.any():
            log.info("%s: %s sin píxeles a menos de %d m de un punto", farm["name"], layer, MAX_DIST_M)
            continue
        publish_layer(api, farm, grid, layer, acquired, index_rgba(surface, valid, layer))
        done[layer] = len(p)
    return done
