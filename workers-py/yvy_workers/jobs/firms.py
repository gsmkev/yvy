"""NASA FIRMS: focos de calor VIIRS y MODIS de las últimas 24 h en Paraguay (PRD §12 firms_hotspots).

Regla (RF-70): foco a < 5 km del perímetro → aviso; alto (warning) si < 2 km. El Worker sube a alto si el
viento pronosticado sopla hacia la estancia a > 25 km/h.
"""

from __future__ import annotations

import csv
import io
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

from ..geo import distance_km, load
from ..ingest import IngestClient

log = logging.getLogger(__name__)

API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"]
PARAGUAY_BBOX = "-62.7,-27.7,-54.2,-19.2"
NEAR_KM = 5.0
CLOSE_KM = 2.0


def parse_csv(text: str, source: str) -> list[dict[str, Any]]:
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            t = datetime.strptime(f"{row['acq_date']} {row['acq_time'].zfill(4)}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
            out.append(
                {
                    "lon": float(row["longitude"]),
                    "lat": float(row["latitude"]),
                    "acquiredAt": int(t.timestamp() * 1000),
                    "confidence": row.get("confidence") or None,
                    "frp": float(row["frp"]) if row.get("frp") else None,
                    "source": source,
                }
            )
        except (KeyError, ValueError):
            continue
    return [h for h in out if confident(h["confidence"])]


def confident(c: str | None) -> bool:
    """MODIS da confianza 0-100; VIIRS l/n/h. Se descarta la baja."""
    c = (c or "").strip().lower()
    return int(c) >= 30 if c.isdigit() else c != "l"


def fetch_hotspots(map_key: str, client: httpx.Client | None = None, days: int = 1) -> list[dict[str, Any]]:
    c = client or httpx.Client(timeout=60)
    hotspots: list[dict[str, Any]] = []
    for src in SOURCES:
        r = c.get(f"{API}/{map_key}/{src}/{PARAGUAY_BBOX}/{days}")
        if r.status_code != 200 or r.text.startswith("Invalid"):
            log.warning("FIRMS %s: %s %s", src, r.status_code, r.text[:80])
            continue
        hotspots += parse_csv(r.text, src)
    return hotspots


def evaluate_farm(farm_geom: dict[str, Any], hotspots: list[dict[str, Any]]) -> dict[str, Any] | None:
    g = load(farm_geom)
    near = []
    for h in hotspots:
        if not (g.bounds[0] - 0.1 <= h["lon"] <= g.bounds[2] + 0.1 and g.bounds[1] - 0.1 <= h["lat"] <= g.bounds[3] + 0.1):
            continue
        d = distance_km(g, h["lon"], h["lat"])
        if d < NEAR_KM:
            near.append((d, h))
    if not near:
        return None
    min_d = min(d for d, _ in near)
    return {"severity": "warning" if min_d < CLOSE_KM else "watch", "minDistanceKm": round(min_d, 2), "hotspots": [h for _, h in near][:40]}


def firms_hotspots(api: IngestClient, farms: list[dict[str, Any]], map_key: str | None = None, client: httpx.Client | None = None) -> int:
    key = map_key or os.environ["FIRMS_MAP_KEY"]
    hotspots = fetch_hotspots(key, client)
    today = datetime.now(timezone.utc).astimezone().date().isoformat()
    sent = 0
    for f in farms:
        res = evaluate_farm(api.farm_geometry(f["id"])["farm"], hotspots)
        if res:
            api.fire_alert(farmId=f["id"], date=today, **res)
            sent += 1
    log.info("firms: %d focos, %d estancias con aviso", len(hotspots), sent)
    return sent
