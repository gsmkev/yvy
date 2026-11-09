"""CHIRPS v3 diario (UCSB CHC): lluvia por estancia (RF-60). PRD §12 chirps_daily.

- final (rnl): llega con ~5-6 semanas de retraso; reemplaza a la preliminar.
- prelim (sat): llega con ~4 días de retraso.
Se lee por rangos HTTP solo el bloque que toca la estancia.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds

from ..geo import load
from ..ingest import IngestClient

log = logging.getLogger(__name__)

BASE = "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily"


def url(d: date, final: bool) -> str:
    if final:
        return f"{BASE}/final/rnl/{d.year}/chirps-v3.0.rnl.{d:%Y.%m.%d}.tif"
    return f"{BASE}/prelim/sat/{d.year}/chirps-v3.0.prelim.{d:%Y.%m.%d}.tif"


def farm_mean(src: rasterio.io.DatasetReader, farm_geom: dict[str, Any]) -> float | None:
    """Media de lluvia en la estancia (píxeles de 0,05° que la tocan)."""
    g = load(farm_geom)
    minx, miny, maxx, maxy = g.bounds
    pad = 0.05
    win = from_bounds(minx - pad, miny - pad, maxx + pad, maxy + pad, src.transform).round_offsets().round_lengths()
    data = src.read(1, window=win, masked=True)
    inside = geometry_mask([g], out_shape=data.shape, transform=src.window_transform(win), invert=True, all_touched=True)
    vals = data[inside & ~np.ma.getmaskarray(data)]
    vals = vals[vals >= 0]
    return round(float(vals.mean()), 2) if vals.size else None


def read_day(d: date, farms: list[tuple[str, dict[str, Any]]], final: bool) -> list[dict[str, Any]]:
    env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="3")
    rows = []
    with env:
        try:
            src = rasterio.open(f"/vsicurl/{url(d, final)}")
        except rasterio.errors.RasterioIOError:
            return []
        with src:
            for farm_id, geom in farms:
                mm = farm_mean(src, geom)
                if mm is not None:
                    rows.append({"farmId": farm_id, "plotId": "", "date": d.isoformat(), "source": "chirps" if final else "chirps_prelim", "precipMm": mm})
    return rows


def chirps_daily(api: IngestClient, farms: list[dict[str, Any]], today: date | None = None, prelim_days: int = 10, final_days: int = 60) -> int:
    today = today or date.today()
    geoms = [(f["id"], api.farm_geometry(f["id"])["farm"]) for f in farms]
    rows: list[dict[str, Any]] = []
    for i in range(1, prelim_days + 1):
        rows += read_day(today - timedelta(days=i), geoms, final=False)
    # Los finales reemplazan a los preliminares (misma fecha, otra fuente: la consulta prefiere 'chirps').
    for i in range(30, final_days + 1):
        rows += read_day(today - timedelta(days=i), geoms, final=True)
    written = api.climate_daily(rows) if rows else 0
    log.info("chirps: %d filas", written)
    return written
