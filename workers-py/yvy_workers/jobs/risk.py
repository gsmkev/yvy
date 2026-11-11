"""Informe de riesgo climático de la estancia (C-10): 30 años de NASA POWER y focos de calor de NASA FIRMS.

- Heladas: días por año con T2M_MIN < 2 °C (1991-2020), peor año, fechas típicas de primera y última helada.
- Lluvia: normal mensual (media y percentiles 20/80 entre años) y los últimos 12 meses completos.
- Sequías: racha más larga de días con menos de 1 mm por año y por verano (noviembre a marzo).
- Fuego: focos VIIRS (375 m) a menos de 10 km del perímetro en los últimos 3 años. Se baja una sola vez para
  todas las estancias (Paraguay entero, de a 5 días) y se reparte; sin FIRMS_MAP_KEY el informe sale sin esa parte.

Todo se calcula acá y se manda como un JSON chico a /ingest/farm-risk: el Worker no procesa nada.
"""

from __future__ import annotations

import logging
import os
import statistics
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
import numpy as np

from ..geo import distance_km, load
from ..ingest import IngestClient
from .firms import API, PARAGUAY_BBOX, parse_csv

log = logging.getLogger(__name__)

POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
NORMAL_FROM = 1991
NORMAL_TO = 2020
FROST_C = 2.0
DRY_MM = 1.0
LONG_SPELL_DAYS = 15
FIRE_RADIUS_KM = 10.0
FIRE_YEARS = 3
FIRMS_CHUNK_DAYS = 5
SP_LAG_DAYS = 95  # el procesamiento estándar (SP) llega con ~3 meses de atraso; lo reciente es NRT


def fetch_power(lat: float, lon: float, end: date, client: httpx.Client | None = None) -> dict[str, dict[str, float]]:
    c = client or httpx.Client(timeout=180)
    r = c.get(
        POWER,
        params={
            "parameters": "T2M_MIN,PRECTOTCORR",
            "community": "AG",
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "start": f"{NORMAL_FROM}0101",
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        },
    )
    r.raise_for_status()
    return r.json()["properties"]["parameter"]


def parse_series(series: dict[str, float]) -> dict[date, float]:
    """{'19910101': 3.2} → {date: 3.2}; descarta los faltantes (-999)."""
    out: dict[date, float] = {}
    for k, v in series.items():
        if v is None or v <= -990:
            continue
        out[date(int(k[:4]), int(k[4:6]), int(k[6:8]))] = float(v)
    return out


def _mmdd(doy: float) -> str:
    d = date(2001, 1, 1) + timedelta(days=int(round(doy)) - 1)  # 2001 no es bisiesto
    return f"{d.month:02d}-{d.day:02d}"


def frost_stats(tmin: dict[date, float], threshold: float = FROST_C) -> dict[str, Any]:
    """Días de helada por año (1991-2020); años con menos de 300 días de dato no cuentan."""
    per_year: list[dict[str, int]] = []
    firsts: list[int] = []
    lasts: list[int] = []
    for y in range(NORMAL_FROM, NORMAL_TO + 1):
        days = {d: v for d, v in tmin.items() if d.year == y}
        if len(days) < 300:
            continue
        frosts = sorted(d for d, v in days.items() if v < threshold)
        per_year.append({"year": y, "days": len(frosts)})
        late = [d for d in frosts if d.month <= 6]
        early = [d for d in frosts if d.month >= 7]
        if late:
            lasts.append(late[-1].timetuple().tm_yday)
        if early:
            firsts.append(early[0].timetuple().tm_yday)
    counts = [p["days"] for p in per_year]
    worst = max(per_year, key=lambda p: p["days"]) if per_year else None
    return {
        "thresholdC": threshold,
        "perYear": per_year,
        "meanPerYear": round(statistics.fmean(counts), 1) if counts else 0.0,
        "worst": worst,
        "yearsWithFrostPct": round(100 * sum(1 for c in counts if c > 0) / len(counts)) if counts else 0,
        "typicalFirstFrost": _mmdd(statistics.median(firsts)) if firsts else None,
        "typicalLastFrost": _mmdd(statistics.median(lasts)) if lasts else None,
    }


def monthly_totals(precip: dict[date, float]) -> dict[tuple[int, int], float]:
    out: dict[tuple[int, int], float] = defaultdict(float)
    for d, v in precip.items():
        out[(d.year, d.month)] += v
    return dict(out)


def rain_stats(precip: dict[date, float], today: date) -> dict[str, Any]:
    totals = monthly_totals(precip)
    normal = []
    for m in range(1, 13):
        vals = [totals[(y, m)] for y in range(NORMAL_FROM, NORMAL_TO + 1) if (y, m) in totals]
        if vals:
            a = np.array(vals)
            normal.append({"month": m, "meanMm": round(float(a.mean()), 1), "p20Mm": round(float(np.percentile(a, 20)), 1), "p80Mm": round(float(np.percentile(a, 80)), 1)})
    annual = sum(n["meanMm"] for n in normal)
    # Últimos 12 meses completos (un mes cuenta si hay dato hasta su último día)
    last_day = max(precip) if precip else today
    is_month_end = (last_day + timedelta(days=1)).month != last_day.month
    end_month = last_day if is_month_end else last_day.replace(day=1) - timedelta(days=1)
    recent = []
    y, m = end_month.year, end_month.month
    for _ in range(12):
        if (y, m) in totals:
            recent.append({"month": f"{y}-{m:02d}", "mm": round(totals[(y, m)], 1)})
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    recent.reverse()
    return {"annualMeanMm": round(annual, 0), "normal": normal, "recent": recent}


def longest_run(precip: dict[date, float], start: date, end: date, threshold: float = DRY_MM) -> tuple[int, int]:
    """(racha más larga de días con lluvia < threshold, cantidad de rachas de >= 15 días) entre start y end."""
    best = cur = spells = 0
    d = start
    while d <= end:
        v = precip.get(d)
        if v is not None and v < threshold:
            cur += 1
        else:
            if cur >= LONG_SPELL_DAYS:
                spells += 1
            best = max(best, cur)
            cur = 0
        d += timedelta(days=1)
    if cur >= LONG_SPELL_DAYS:
        spells += 1
    return max(best, cur), spells


def dry_stats(precip: dict[date, float]) -> dict[str, Any]:
    years = [y for y in range(NORMAL_FROM, NORMAL_TO + 1) if sum(1 for d in precip if d.year == y) >= 300]
    runs = {y: longest_run(precip, date(y, 1, 1), date(y, 12, 31)) for y in years}
    summers = [longest_run(precip, date(y, 11, 1), date(y + 1, 3, 31))[0] for y in years if y < NORMAL_TO]
    worst_year = max(years, key=lambda y: runs[y][0]) if years else None
    return {
        "thresholdMm": DRY_MM,
        "meanLongestDays": round(statistics.fmean(r[0] for r in runs.values()), 1) if runs else 0.0,
        "worst": {"year": worst_year, "days": runs[worst_year][0]} if worst_year else None,
        "spells15PerYear": round(statistics.fmean(r[1] for r in runs.values()), 2) if runs else 0.0,
        "summerMeanLongestDays": round(statistics.fmean(summers), 1) if summers else 0.0,
    }


# ---------- FIRMS: focos de los últimos 3 años ----------


def firms_windows(start: date, end: date, today: date) -> list[tuple[str, date, int]]:
    """(fuente, desde, días) de a 5 días: SP hasta hace ~95 días y NRT para lo más reciente."""
    cut = today - timedelta(days=SP_LAG_DAYS)
    out: list[tuple[str, date, int]] = []
    d = start
    while d <= end:
        n = min(FIRMS_CHUNK_DAYS, (end - d).days + 1)
        source = "VIIRS_SNPP_SP" if d + timedelta(days=n - 1) <= cut else "VIIRS_SNPP_NRT"
        out.append((source, d, n))
        d += timedelta(days=n)
    return out


def fetch_hotspot_history(map_key: str, today: date, client: httpx.Client | None = None, pause: float = 0.0) -> list[dict[str, Any]]:
    c = client or httpx.Client(timeout=90)
    start = today - timedelta(days=365 * FIRE_YEARS)
    hotspots: list[dict[str, Any]] = []
    failed = 0
    for source, d, n in firms_windows(start, today, today):
        r = c.get(f"{API}/{map_key}/{source}/{PARAGUAY_BBOX}/{n}/{d.isoformat()}")
        if r.status_code != 200 or r.text.startswith("Invalid") or "latitude" not in r.text[:200]:
            failed += 1
            log.warning("FIRMS %s %s: %s %s", source, d, r.status_code, r.text[:60])
            continue
        hotspots += parse_csv(r.text, source)
        if pause:
            time.sleep(pause)
    if failed:
        log.warning("FIRMS: %d tramos sin dato de %d", failed, len(firms_windows(start, today, today)))
    return hotspots


def fire_stats(farm_geom: dict[str, Any], hotspots: list[dict[str, Any]], today: date, radius_km: float = FIRE_RADIUS_KM) -> dict[str, Any]:
    g = load(farm_geom)
    pad = radius_km / 111 + 0.02
    near: list[tuple[float, dict[str, Any]]] = []
    for h in hotspots:
        if not (g.bounds[0] - pad <= h["lon"] <= g.bounds[2] + pad and g.bounds[1] - pad <= h["lat"] <= g.bounds[3] + pad):
            continue
        d = distance_km(g, h["lon"], h["lat"])
        if d <= radius_km:
            near.append((d, h))
    windows = []
    for i in range(FIRE_YEARS):
        to = today - timedelta(days=365 * i)
        frm = to - timedelta(days=364)
        a = int(datetime(frm.year, frm.month, frm.day, tzinfo=timezone.utc).timestamp() * 1000)
        b = int(datetime(to.year, to.month, to.day, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)
        windows.append({"from": frm.isoformat(), "to": to.isoformat(), "count": sum(1 for _, h in near if a <= h["acquiredAt"] <= b)})
    windows.reverse()
    by_month = [0] * 12
    for _, h in near:
        by_month[datetime.fromtimestamp(h["acquiredAt"] / 1000, timezone.utc).month - 1] += 1
    return {
        "radiusKm": radius_km,
        "years": FIRE_YEARS,
        "total": len(near),
        "perYear": windows,
        "byMonth": by_month,
        "nearestKm": round(min(d for d, _ in near), 1) if near else None,
        "lastAt": max(h["acquiredAt"] for _, h in near) if near else None,
        "source": "NASA FIRMS VIIRS 375 m",
    }


def build_report(power: dict[str, dict[str, float]], today: date, fire: dict[str, Any] | None, now_ms: int | None = None) -> dict[str, Any]:
    tmin = parse_series(power.get("T2M_MIN", {}))
    precip = parse_series(power.get("PRECTOTCORR", {}))
    normal_tmin = {d: v for d, v in tmin.items() if NORMAL_FROM <= d.year <= NORMAL_TO}
    normal_precip = {d: v for d, v in precip.items() if NORMAL_FROM <= d.year <= NORMAL_TO}
    return {
        "version": 1,
        "generatedAt": now_ms if now_ms is not None else int(time.time() * 1000),
        "normalFrom": NORMAL_FROM,
        "normalTo": NORMAL_TO,
        "frost": frost_stats(normal_tmin),
        "rain": rain_stats({**normal_precip, **{d: v for d, v in precip.items() if d.year > NORMAL_TO}}, today),
        "dry": dry_stats(normal_precip),
        "fire": fire,
    }


def risk_report(
    api: IngestClient,
    farms: list[dict[str, Any]],
    map_key: str | None = None,
    client: httpx.Client | None = None,
    firms_client: httpx.Client | None = None,
    today: date | None = None,
) -> int:
    """Calcula y sube el informe de cada estancia. Devuelve la cantidad de fallas."""
    today = today or datetime.now(timezone.utc).date()
    key = map_key if map_key is not None else os.environ.get("FIRMS_MAP_KEY", "")
    hotspots: list[dict[str, Any]] | None = None
    if key and farms:
        try:
            hotspots = fetch_hotspot_history(key, today, firms_client, pause=0.1)
            log.info("FIRMS: %d focos en %d años", len(hotspots), FIRE_YEARS)
        except Exception:
            log.exception("FIRMS falló: los informes salen sin focos de calor")
    else:
        log.warning("Sin FIRMS_MAP_KEY: los informes salen sin focos de calor")
    failures = 0
    for f in farms:
        try:
            power = fetch_power(f["centroidLat"], f["centroidLon"], today - timedelta(days=3), client)
            fire = fire_stats(api.farm_geometry(f["id"])["farm"], hotspots, today) if hotspots is not None else None
            api.farm_risk(f["id"], build_report(power, today, fire))
            log.info("%s: informe de riesgo subido", f["name"])
        except Exception:
            failures += 1
            log.exception("falló el informe de riesgo de %s", f["name"])
    return failures
