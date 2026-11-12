"""Índice de precipitación estandarizado, SPI a 1, 3 y 6 meses (C-07).

- Lluvia reciente: CHIRPS diario de la estancia (la que ya guarda chirps_daily), por meses calendario completos.
- Referencia: normal 1991-2020 de NASA POWER (PRECTOTCORR), la misma que usa la climatología de la estancia
  (docs/adr/0003: CHIRPS de 30 años serían ~11.000 archivos). Se ajusta una distribución gamma a los totales de
  cada ventana de n meses y se convierte la lluvia reciente en un puntaje z (McKee et al., 1993).
- Si en la ventana reciente faltan días de CHIRPS (menos del 90 %), ese SPI queda en null con motivo.

CHIRPS y POWER tienen sesgos distintos: el SPI es una guía de tendencia, no una medida exacta.
Resultado chico (un JSON) a /ingest/farm-spi.
"""

from __future__ import annotations

import logging
import math
import time
from datetime import date, timedelta
from statistics import NormalDist
from typing import Any

import httpx

from ..ingest import IngestClient
from .risk import NORMAL_FROM, NORMAL_TO, fetch_power, monthly_totals, parse_series

log = logging.getLogger(__name__)

SCALES = (1, 3, 6)
MIN_COVERAGE = 0.9
MIN_YEARS = 20
_Z = NormalDist()


def gamma_cdf(x: float, shape: float, scale: float) -> float:
    """Función gamma incompleta regularizada P(shape, x/scale) (serie y fracción continua de Numerical Recipes)."""
    if x <= 0:
        return 0.0
    a, z = shape, x / scale
    gln = math.lgamma(a)
    if z < a + 1:
        ap, term, total = a, 1.0 / a, 1.0 / a
        for _ in range(500):
            ap += 1
            term *= z / ap
            total += term
            if abs(term) < abs(total) * 1e-12:
                break
        return min(1.0, total * math.exp(-z + a * math.log(z) - gln))
    b = z + 1 - a
    c = 1e300
    d = 1 / b
    h = d
    for i in range(1, 500):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        d = 1e-300 if abs(d) < 1e-300 else d
        c = b + an / c
        c = 1e-300 if abs(c) < 1e-300 else c
        d = 1 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-12:
            break
    return max(0.0, 1.0 - math.exp(-z + a * math.log(z) - gln) * h)


def fit_gamma(values: list[float]) -> tuple[float, float, float] | None:
    """(forma, escala, proporción de ceros) por máxima verosimilitud aproximada (Thom); None si no alcanza."""
    if len(values) < MIN_YEARS:
        return None
    pos = [v for v in values if v > 0]
    q = 1 - len(pos) / len(values)
    if len(pos) < MIN_YEARS // 2:
        return None
    mean = sum(pos) / len(pos)
    a_stat = math.log(mean) - sum(math.log(v) for v in pos) / len(pos)
    if a_stat <= 0:
        return None
    shape = (1 + math.sqrt(1 + 4 * a_stat / 3)) / (4 * a_stat)
    return shape, mean / shape, q


def spi_from_fit(x: float, fit: tuple[float, float, float]) -> float:
    shape, scale, q = fit
    h = q + (1 - q) * gamma_cdf(x, shape, scale)
    h = min(max(h, 1e-6), 1 - 1e-6)
    return max(-4.0, min(4.0, _Z.inv_cdf(h)))


def window_months(end_year: int, end_month: int, n: int) -> list[tuple[int, int]]:
    out = []
    y, m = end_year, end_month
    for _ in range(n):
        out.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out


def reference_sums(totals: dict[tuple[int, int], float], end_month: int, n: int) -> list[float]:
    """Total de lluvia de las n meses que terminan en `end_month`, para cada año de la normal con la ventana completa."""
    sums = []
    for y in range(NORMAL_FROM, NORMAL_TO + 1):
        months = window_months(y, end_month, n)
        if all(k in totals for k in months):
            sums.append(sum(totals[k] for k in months))
    return sums


def last_complete_month(today: date, last_data_day: date | None) -> tuple[int, int]:
    """Último mes calendario completo con lluvia de CHIRPS."""
    end = min(today, last_data_day) if last_data_day else today
    first = end.replace(day=1)
    if (end + timedelta(days=1)).month != end.month:  # el dato llega hasta fin de mes
        return end.year, end.month
    prev = first - timedelta(days=1)
    return prev.year, prev.month


def compute_spi(
    chirps: dict[date, float], reference: dict[tuple[int, int], float], today: date
) -> dict[str, Any]:
    through_y, through_m = last_complete_month(today, max(chirps) if chirps else None)
    scales: list[dict[str, Any]] = []
    for n in SCALES:
        sums = reference_sums(reference, through_m, n)
        fit = fit_gamma(sums)
        months = window_months(through_y, through_m, n)
        first = date(*months[-1], 1)
        last = date(through_y, through_m, 1)
        last = (last.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        days = (last - first).days + 1
        have = [chirps[d] for d in (first + timedelta(days=i) for i in range(days)) if d in chirps]
        normal = round(sum(sums) / len(sums), 1) if sums else None
        if fit is None:
            scales.append({"scale": n, "spi": None, "mm": None, "normalMm": normal, "reason": "no_reference"})
        elif len(have) < MIN_COVERAGE * days:
            scales.append({"scale": n, "spi": None, "mm": None, "normalMm": normal, "reason": "chirps_incomplete"})
        else:
            mm = round(sum(have) * days / len(have), 1)  # completa los pocos días sin dato con el promedio
            scales.append({"scale": n, "spi": round(spi_from_fit(mm, fit), 2), "mm": mm, "normalMm": normal, "reason": None})
    return {
        "version": 1,
        "generatedAt": int(time.time() * 1000),
        "throughMonth": f"{through_y}-{through_m:02d}",
        "referenceFrom": NORMAL_FROM,
        "referenceTo": NORMAL_TO,
        "scales": scales,
    }


def spi_report(api: IngestClient, farms: list[dict[str, Any]], today: date | None = None, client: httpx.Client | None = None) -> int:
    """Devuelve cuántas estancias fallaron."""
    today = today or date.today()
    failures = 0
    for f in farms:
        try:
            power = fetch_power(f["centroidLat"], f["centroidLon"], today, client)
            reference = monthly_totals(parse_series(power.get("PRECTOTCORR", {})))
            start = (today.replace(day=1) - timedelta(days=200)).isoformat()
            chirps = {date.fromisoformat(r["date"]): float(r["mm"]) for r in api.farm_precip(f["id"], start)}
            api.farm_spi(f["id"], compute_spi(chirps, reference, today))
            log.info("%s: SPI calculado", f["name"])
        except Exception:  # una estancia que falla no frena a las demás
            failures += 1
            log.exception("falló spi en %s", f["name"])
    return failures
