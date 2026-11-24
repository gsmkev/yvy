"""Sentinel-2: índices de vegetación (S-07), estadísticas por lote y mosaico de una pasada."""

from __future__ import annotations

from typing import Any

import numpy as np
import shapely
from rasterio.features import geometry_mask
from shapely.geometry.base import BaseGeometry

from .s2_bands import Grid, reflectance, scl_valid

MIN_VALID_PCT = 60.0  # RF-51
THIN_PLOT_M = 30.0  # S-11: un lote más angosto que esto casi no tiene píxeles de 10 m "puros"
INDICES = ("ndvi", "ndre", "ndmi", "evi")  # S-07


def compute_ndvi(red: np.ndarray, nir: np.ndarray, valid: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
    ok = valid & np.isfinite(ndvi) & (np.abs(ndvi) <= 1)
    return np.where(ok, ndvi, np.nan), ok


def is_thin(geom: BaseGeometry, width_m: float = THIN_PLOT_M) -> bool:
    """S-11: ¿el lote es más angosto que `width_m` en algún tramo? (geom en metros): si no sobrevive a un retroceso de medio ancho."""
    return bool(shapely.is_empty(geom.buffer(-width_m / 2)))


def compute_indices(bands: dict[str, np.ndarray], valid: np.ndarray, wanted: tuple[str, ...] = INDICES) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Índices de vegetación de una escena (S-07). `bands` con reflectancia: red, nir, rededge1 (B05), nir08 (B8A),
    swir16 (B11) y blue. Cada índice devuelve (valores con NaN donde no vale, máscara válida).

    NDVI = (NIR - R) / (NIR + R)            vigor
    NDRE = (B8A - B05) / (B8A + B05)        nitrógeno / clorofila (borde rojo)
    NDMI = (NIR - SWIR1) / (NIR + SWIR1)    humedad de la vegetación
    EVI  = 2,5 (NIR - R) / (NIR + 6 R - 7,5 Azul + 1)   no se satura tanto con follaje denso
    """
    out: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    with np.errstate(divide="ignore", invalid="ignore"):
        for idx in wanted:
            if idx == "ndvi":
                v = (bands["nir"] - bands["red"]) / (bands["nir"] + bands["red"])
            elif idx == "ndre":
                v = (bands["nir08"] - bands["rededge1"]) / (bands["nir08"] + bands["rededge1"])
            elif idx == "ndmi":
                v = (bands["nir"] - bands["swir16"]) / (bands["nir"] + bands["swir16"])
            elif idx == "evi":
                v = 2.5 * (bands["nir"] - bands["red"]) / (bands["nir"] + 6 * bands["red"] - 7.5 * bands["blue"] + 1)
            else:
                raise ValueError(f"índice desconocido: {idx}")
            ok = valid & np.isfinite(v) & (np.abs(v) <= 1)
            out[idx] = (np.where(ok, v, np.nan).astype("float32"), ok)
    return out


def plot_stats(ndvi: np.ndarray, ok: np.ndarray, grid: Grid, idx: str = "ndvi") -> list[dict[str, Any]]:
    """Media, p10, p90 y % de píxeles válidos por lote. Descarta lotes con < 60 % válido (RF-51).

    Los lotes de menos de 30 m de ancho usan todos los píxeles que toca el polígono (si no, quedan sin ninguno) y
    se marcan `lowConfidence`: esos píxeles mezclan el lote con lo de al lado (S-11).
    """
    out = []
    for plot_id, geom in grid.plots:
        thin = is_thin(geom)
        inside = geometry_mask([geom], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True, all_touched=thin)
        total = int(inside.sum())
        if total == 0:
            continue
        vals = ndvi[inside & ok]
        valid_pct = 100.0 * vals.size / total
        if valid_pct < MIN_VALID_PCT or vals.size == 0:
            continue
        out.append(
            {
                "plotId": plot_id,
                "idx": idx,
                "lowConfidence": thin,
                "mean": round(float(np.mean(vals)), 4),
                "p10": round(float(np.percentile(vals, 10)), 4),
                "p90": round(float(np.percentile(vals, 90)), 4),
                "validPct": round(valid_pct, 1),
            }
        )
    return out


BAND_FOR = {"ndvi": ("red", "nir"), "ndre": ("nir08", "rededge1"), "ndmi": ("nir", "swir16"), "evi": ("red", "nir", "blue")}


def mosaic_indices(items: list[dict[str, Any]], grid: Grid, wanted: tuple[str, ...] = INDICES) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Índices de la pasada: cada píxel toma la primera tesela con dato válido. Solo baja las bandas que hacen falta."""
    shape = (grid.height, grid.width)
    res = {i: (np.full(shape, np.nan, dtype="float32"), np.zeros(shape, dtype=bool)) for i in wanted}
    names = sorted({b for i in wanted for b in BAND_FOR[i]})
    for item in items:
        if all(ok.all() for _, ok in res.values()):
            break
        valid = scl_valid(item, grid)
        if not any(valid[~ok].any() for _, ok in res.values()):
            continue
        bands = {b: reflectance(item, b, grid) for b in names}
        for idx, (vals, o) in compute_indices(bands, valid, wanted).items():
            arr, ok = res[idx]
            take = o & ~ok
            arr[take] = vals[take]
            ok |= take
    return res


def mosaic_ndvi(items: list[dict[str, Any]], grid: Grid) -> tuple[np.ndarray, np.ndarray]:
    return mosaic_indices(items, grid, ("ndvi",))["ndvi"]
