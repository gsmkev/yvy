"""Informe gratis de riesgo climático para quien lo pidió en la landing (V-04).

Es el mismo informe de la estancia (C-10: heladas, lluvia, sequías y focos de fuego a menos de 10 km), calculado para el
punto que marcó la persona. El Worker lo guarda y manda el email con el enlace (POST /ingest/leads/:id/report).
Los focos de FIRMS se bajan una sola vez para todos los pedidos de la corrida; sin FIRMS_MAP_KEY el informe sale sin
esa parte. El vigor satelital (S-01) no se incluye: necesita el perímetro de una estancia y este pedido es un punto.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from ..ingest import IngestClient
from .risk import FIRE_YEARS, build_report, fetch_hotspot_history, fetch_power, fire_stats

log = logging.getLogger(__name__)


def lead_report(
    api: IngestClient,
    leads: list[dict[str, Any]],
    map_key: str | None = None,
    client: httpx.Client | None = None,
    firms_client: httpx.Client | None = None,
    today: date | None = None,
) -> int:
    """Calcula y sube el informe de cada pedido. Devuelve la cantidad de fallas (se reintentan en la próxima corrida)."""
    if not leads:
        log.info("sin pedidos pendientes")
        return 0
    today = today or datetime.now(timezone.utc).date()
    key = map_key if map_key is not None else os.environ.get("FIRMS_MAP_KEY", "")
    hotspots: list[dict[str, Any]] | None = None
    if key:
        try:
            hotspots = fetch_hotspot_history(key, today, firms_client, pause=0.1)
            log.info("FIRMS: %d focos en %d años", len(hotspots), FIRE_YEARS)
        except Exception:
            log.exception("FIRMS falló: los informes salen sin focos de calor")
    else:
        log.warning("Sin FIRMS_MAP_KEY: los informes salen sin focos de calor")
    failures = 0
    for lead in leads:
        try:
            power = fetch_power(lead["lat"], lead["lon"], today - timedelta(days=3), client)
            point = {"type": "Point", "coordinates": [lead["lon"], lead["lat"]]}
            fire = fire_stats(point, hotspots, today) if hotspots is not None else None
            api.lead_report(lead["id"], build_report(power, today, fire))
            log.info("pedido %s: informe subido", lead["id"])
        except Exception:
            failures += 1
            log.exception("falló el informe del pedido %s", lead["id"])
    return failures
