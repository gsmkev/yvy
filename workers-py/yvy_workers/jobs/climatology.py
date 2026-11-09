"""Climatología 1991-2020 por día del año (PRD §12 climatology_build). Una vez por estancia.

- precip: NASA POWER PRECTOTCORR diario (una sola request por punto). CHIRPS daría mejor resolución
  pero exigiría ~11.000 archivos; ver docs/adr/0003.
- soil_top / soil_root: NASA POWER GWETTOP / GWETROOT (fracción de saturación).
- tmin: NASA POWER T2M_MIN.
Percentiles con una ventana móvil de ±15 días para que no sean ruidosos.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx
import numpy as np

from ..ingest import IngestClient

POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
VARS = {"PRECTOTCORR": "precip", "GWETTOP": "soil_top", "GWETROOT": "soil_root", "T2M_MIN": "tmin"}
WINDOW = 15


def fetch_power(lat: float, lon: float, client: httpx.Client | None = None) -> dict[str, dict[str, float]]:
    c = client or httpx.Client(timeout=120)
    r = c.get(
        POWER,
        params={"parameters": ",".join(VARS), "community": "AG", "latitude": round(lat, 4), "longitude": round(lon, 4), "start": "19910101", "end": "20201231", "format": "JSON"},
    )
    r.raise_for_status()
    return r.json()["properties"]["parameter"]


def doy_table(series: dict[str, float]) -> list[dict[str, float | None]]:
    """Por día del año (1-366): p20, p50, p80 y media, con ventana circular de ±15 días."""
    by_doy: list[list[float]] = [[] for _ in range(367)]
    for k, v in series.items():
        if v is None or v <= -999:
            continue
        d = date(int(k[:4]), int(k[4:6]), int(k[6:8]))
        by_doy[d.timetuple().tm_yday].append(v)
    out = []
    for doy in range(1, 367):
        vals: list[float] = []
        for off in range(-WINDOW, WINDOW + 1):
            vals += by_doy[(doy - 1 + off) % 366 + 1]
        if not vals:
            out.append({"dayOfYear": doy, "p20": None, "p50": None, "p80": None, "mean": None})
            continue
        a = np.array(vals)
        out.append({"dayOfYear": doy, "p20": round(float(np.percentile(a, 20)), 4), "p50": round(float(np.percentile(a, 50)), 4), "p80": round(float(np.percentile(a, 80)), 4), "mean": round(float(a.mean()), 4)})
    return out


def climatology_build(api: IngestClient, farm: dict[str, Any], client: httpx.Client | None = None) -> int:
    params = fetch_power(farm["centroidLat"], farm["centroidLon"], client)
    rows: list[dict[str, Any]] = []
    for power_var, var in VARS.items():
        for r in doy_table(params.get(power_var, {})):
            rows.append({"farmId": farm["id"], "plotId": "", "variable": var, **r})
    return api.climatology(rows)
