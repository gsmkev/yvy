"""Zonas de manejo a partir de varias campañas de vigor (A-32).

Por campaña se arma un compuesto del NDVI máximo de la estación de cultivo (diciembre a marzo; el máximo de varias pasadas
sorteaba nubes) a 10 m. Dentro de cada lote, el NDVI de cada campaña se pasa a puntaje z (cuánto se aparta de la media
del lote ese año: así sirven campañas con cultivos distintos) y los píxeles se agrupan con k-means en 3 zonas: baja,
media y alta productividad relativa. La zona se mantiene si se repite entre campañas (el agrupamiento usa todas a la vez).

Todo se calcula acá; al Worker llega un JSON chico por lote (polígonos simplificados) que solo valida la forma.
Pesado: corre a mano o trimestral en GitHub Actions, nunca en el Worker.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

import numpy as np
from rasterio.features import geometry_mask, shapes
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from ..geo import from_crs
from ..ingest import IngestClient
from .s2 import Grid, farm_bbox, group_passes, make_grid, mosaic_ndvi, search

log = logging.getLogger(__name__)

SEASONS = 3
K = 3
MIN_SEASONS = 2  # un píxel entra si tiene dato en al menos 2 campañas
MIN_PIXELS = 150
MIN_HA = 0.5
SIMPLIFY_M = 10.0
MAX_PARTS = 15
PASSES_PER_SEASON = 10
SEASON_CLOUD = 60.0
STD_FLOOR = 0.02
MIN_VALID_PCT = 60.0


def kmeans(x: np.ndarray, k: int = K, iters: int = 60) -> tuple[np.ndarray, np.ndarray]:
    """k-means de Lloyd, determinístico: los centros iniciales son filas de los cuantiles de la media de cada fila."""
    order = np.argsort(x.mean(axis=1), kind="stable")
    centers = np.stack([x[order[int(len(x) * (2 * i + 1) / (2 * k))]] for i in range(k)]).astype("float64")
    labels = np.zeros(len(x), dtype=int)
    for _ in range(iters):
        d = ((x[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        new = d.argmin(axis=1)
        if _ and (new == labels).all():
            break
        labels = new
        for c in range(k):
            sel = x[labels == c]
            if len(sel):
                centers[c] = sel.mean(axis=0)
    return labels, centers


def majority_filter(labels: np.ndarray, inside: np.ndarray, k: int = K) -> np.ndarray:
    """Cada píxel toma la clase más común de su vecindad 3x3 (saca el ruido de píxeles sueltos). Los de afuera quedan en 0."""
    pad = np.pad(labels, 1)
    counts = np.zeros((k, *labels.shape), dtype=int)
    for c in range(1, k + 1):
        is_c = (pad == c).astype(int)
        counts[c - 1] = sum(is_c[1 + dy : is_c.shape[0] - 1 + dy, 1 + dx : is_c.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    out = counts.argmax(axis=0) + 1
    return np.where(inside & (labels > 0), out, 0)


def cluster_plot(stack: np.ndarray, inside: np.ndarray, k: int = K) -> tuple[np.ndarray, int] | None:
    """stack: (campañas, alto, ancho) de NDVI con NaN donde falta. Devuelve (etiquetas 0..k, campañas usadas); 1 = zona más baja."""
    valid = inside[None] & np.isfinite(stack)
    seasons_ok = [s for s in range(len(stack)) if valid[s].sum() >= MIN_PIXELS and 100.0 * valid[s].sum() / max(int(inside.sum()), 1) >= MIN_VALID_PCT]
    if len(seasons_ok) < MIN_SEASONS:
        return None
    s = stack[seasons_ok]
    v = valid[seasons_ok]
    z = np.zeros_like(s, dtype="float64")
    for i in range(len(s)):
        vals = s[i][v[i]]
        z[i] = np.where(v[i], (s[i] - vals.mean()) / max(float(vals.std()), STD_FLOOR), 0.0)
    pix = v.sum(axis=0) >= MIN_SEASONS
    if pix.sum() < MIN_PIXELS:
        return None
    x = z[:, pix].T
    labels, _ = kmeans(x, k)
    # 1 = menor NDVI medio (en valores reales, sobre las campañas con dato)
    raw = np.where(v, s, np.nan)[:, pix]
    mean_ndvi = np.array([np.nanmean(raw[:, labels == c]) if (labels == c).any() else np.inf for c in range(k)])
    rank = np.empty(k, dtype=int)
    rank[np.argsort(mean_ndvi)] = np.arange(1, k + 1)
    grid = np.zeros(stack.shape[1:], dtype=int)
    grid[pix] = rank[labels]
    return majority_filter(grid, pix, k), len(seasons_ok)


def zone_polygons(labels: np.ndarray, ndvi_mean: np.ndarray, transform: Any, crs: Any, k: int = K) -> list[dict[str, Any]]:
    """Una entrada por zona: superficie, porcentaje, NDVI medio y la geometría (WGS84) sin partes menores a 0,5 ha."""
    total = int((labels > 0).sum())
    out: list[dict[str, Any]] = []
    for c in range(1, k + 1):
        mask = labels == c
        px = int(mask.sum())
        if px == 0:
            continue
        parts: list[tuple[float, BaseGeometry]] = []
        for g, _ in shapes(mask.astype("uint8"), mask=mask, transform=transform, connectivity=4):
            poly = shape(g)
            if poly.area / 10_000 >= MIN_HA:
                parts.append((poly.area, poly))
        if not parts:
            continue
        parts.sort(key=lambda p: -p[0])
        merged = unary_union([p for _, p in parts[:MAX_PARTS]]).simplify(SIMPLIFY_M)
        if merged.is_empty:
            continue
        if merged.geom_type == "Polygon":
            merged = MultiPolygon([merged])
        elif merged.geom_type != "MultiPolygon":
            continue
        wgs = from_crs(merged, crs)
        out.append(
            {
                "zone": c,
                "areaHa": round(px * 0.01, 2),
                "pct": round(100.0 * px / total, 1),
                "meanNdvi": round(float(np.nanmean(ndvi_mean[mask])), 3),
                "geometry": mapping(wgs),
            }
        )
    return out


def season_composite(grid: Grid, farm: dict[str, Any], year: int) -> np.ndarray | None:
    """NDVI máximo de la estación diciembre `year` a marzo `year + 1`, con hasta PASSES_PER_SEASON pasadas parejas."""
    start = datetime(year, 12, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 3, 31, tzinfo=timezone.utc)
    passes = group_passes(search(farm_bbox(farm), start, end, SEASON_CLOUD))
    if not passes:
        return None
    idx = np.linspace(0, len(passes) - 1, min(PASSES_PER_SEASON, len(passes))).round().astype(int)
    comp = np.full((grid.height, grid.width), np.nan, dtype="float32")
    for i in sorted(set(idx.tolist())):
        ndvi, ok = mosaic_ndvi(passes[i][1], grid)
        comp = np.fmax(comp, np.where(ok, ndvi, np.nan))
    return comp


def season_years(today: date, n: int = SEASONS) -> list[int]:
    """Años de inicio de las últimas n estaciones (dic a mar) ya terminadas."""
    last = today.year - 1 if today >= date(today.year, 4, 1) else today.year - 2
    return list(range(last - n + 1, last + 1))


def management_zones(api: IngestClient, farm: dict[str, Any], today: date | None = None) -> int:
    """Calcula y sube las zonas de cada lote de la estancia. Devuelve cuántos lotes quedaron con zonas."""
    today = today or date.today()
    geom = api.farm_geometry(farm["id"])
    if not geom["plots"]:
        return 0
    grid = make_grid(geom)
    years = season_years(today)
    comps = [(y, season_composite(grid, farm, y)) for y in years]
    comps = [(y, c) for y, c in comps if c is not None]
    if len(comps) < MIN_SEASONS:
        log.warning("%s: menos de %d campañas con imágenes, sin zonas de manejo", farm["name"], MIN_SEASONS)
        return 0
    stack = np.stack([c for _, c in comps])
    mean_ndvi = np.nanmean(stack, axis=0)
    done = 0
    for plot_id, g in grid.plots:
        inside = geometry_mask([g], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
        res = cluster_plot(stack, inside)
        if res is None:
            continue
        labels, used = res
        zones = zone_polygons(labels, mean_ndvi, grid.transform, grid.crs)
        if zones:
            api.management_zones(plot_id, [y for y, _ in comps], zones)
            done += 1
    return done
