"""NASA POWER diario por estancia: temperatura mínima y máxima y humedad del suelo de la última campaña.

Alimenta la fenología por grados-día (A-04), el balance hídrico (C-08) y la ventana de siembra (A-05). El Worker solo
baja los últimos 14 días para el aviso de sequía; acá se completa la historia de la campaña (400 días por defecto) para
que los grados-día se acumulen desde la siembra. Es idempotente: se vuelve a escribir la ventana entera (misma clave).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import httpx

from ..ingest import IngestClient

log = logging.getLogger(__name__)

POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = "T2M_MIN,T2M_MAX,GWETTOP,GWETROOT"
DEFAULT_DAYS = 400
# POWER publica con ~2 días de retraso: pedir hasta hoy devuelve -999 al final, que se descarta
LAG_DAYS = 2


def fetch_power(lat: float, lon: float, start: date, end: date, client: httpx.Client | None = None) -> dict[str, dict[str, float]]:
    c = client or httpx.Client(timeout=120)
    r = c.get(
        POWER,
        params={
            "parameters": PARAMS,
            "community": "AG",
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        },
    )
    r.raise_for_status()
    return r.json()["properties"]["parameter"]


def _val(series: dict[str, float], key: str) -> float | None:
    v = series.get(key)
    return None if v is None or v <= -990 else round(float(v), 3)


def daily_rows(farm_id: str, params: dict[str, dict[str, float]]) -> list[dict[str, Any]]:
    """Filas de /ingest/climate-daily (una por día con algún dato). La lluvia queda a cargo de CHIRPS."""
    rows: list[dict[str, Any]] = []
    for key in sorted(params.get("T2M_MIN", {})):
        tmin = _val(params["T2M_MIN"], key)
        tmax = _val(params.get("T2M_MAX", {}), key)
        top = _val(params.get("GWETTOP", {}), key)
        root = _val(params.get("GWETROOT", {}), key)
        if tmin is None and tmax is None and top is None:
            continue
        rows.append(
            {
                "farmId": farm_id,
                "plotId": "",
                "date": f"{key[:4]}-{key[4:6]}-{key[6:8]}",
                "source": "nasa_power",
                "tminC": tmin,
                "tmaxC": tmax,
                "soilMoisture0_7": top,
                "soilMoisture7_28": root,
            }
        )
    return rows


def power_daily(api: IngestClient, farms: list[dict[str, Any]], days: int = DEFAULT_DAYS, today: date | None = None, client: httpx.Client | None = None) -> int:
    """Devuelve la cantidad de estancias que fallaron (para el código de salida)."""
    today = today or date.today()
    c = client or httpx.Client(timeout=120)
    failures = 0
    for f in farms:
        try:
            params = fetch_power(f["centroidLat"], f["centroidLon"], today - timedelta(days=days), today - timedelta(days=LAG_DAYS), c)
            n = api.climate_daily(daily_rows(f["id"], params))
            log.info("%s: %d días de NASA POWER", f["name"], n)
        except Exception:  # una estancia que falla no frena a las demás
            failures += 1
            log.exception("falló power_daily en %s", f["name"])
    return failures
