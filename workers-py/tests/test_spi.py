import math
import random
from datetime import date, timedelta

import pytest

from yvy_workers.jobs.spi import compute_spi, fit_gamma, gamma_cdf, last_complete_month, spi_from_fit, window_months


def test_gamma_cdf_valores_conocidos():
    # Gamma(forma 1) es la exponencial: P = 1 - exp(-x)
    assert gamma_cdf(1.0, 1.0, 1.0) == pytest.approx(1 - math.exp(-1), abs=1e-9)
    assert gamma_cdf(0.0, 2.0, 1.0) == 0.0
    # Gamma(2, 1) en 2: 1 - 3 e^-2
    assert gamma_cdf(2.0, 2.0, 1.0) == pytest.approx(1 - 3 * math.exp(-2), abs=1e-9)
    # rama de fracción continua (z grande)
    assert gamma_cdf(10.0, 2.0, 1.0) == pytest.approx(1 - 11 * math.exp(-10), abs=1e-9)


def test_ajuste_y_spi_de_la_mediana_es_cercano_a_cero():
    rng = random.Random(7)
    sample = [rng.gammavariate(4.0, 50.0) for _ in range(30)]
    fit = fit_gamma(sample)
    assert fit is not None
    shape, scale, q = fit
    assert 2 < shape < 8 and q == 0
    median = sorted(sample)[15]
    assert abs(spi_from_fit(median, fit)) < 0.5
    assert spi_from_fit(10.0, fit) < -1.5  # muy seco
    assert spi_from_fit(900.0, fit) > 1.5  # muy húmedo
    assert fit_gamma([1.0] * 5) is None  # pocos años


def test_ventanas_de_meses_cruzan_el_anio():
    assert window_months(2026, 2, 3) == [(2026, 2), (2026, 1), (2025, 12)]


def test_ultimo_mes_completo():
    assert last_complete_month(date(2026, 11, 11), date(2026, 11, 8)) == (2026, 10)
    assert last_complete_month(date(2026, 11, 2), date(2026, 10, 31)) == (2026, 10)


def _reference(mean_daily=4.0):
    rng = random.Random(1)
    return {(y, m): max(0.0, rng.gammavariate(4.0, mean_daily * 30 / 4)) for y in range(1991, 2021) for m in range(1, 13)}


def _chirps(start: date, end: date, mm: float):
    d, out = start, {}
    while d <= end:
        out[d] = mm
        d += timedelta(days=1)
    return out


def test_compute_spi_sequia_y_normal_y_datos_incompletos():
    ref = _reference()
    today = date(2026, 11, 11)
    # 200 días sin casi lluvia: sequía en los tres plazos
    dry = compute_spi(_chirps(date(2026, 4, 1), date(2026, 11, 8), 0.2), ref, today)
    assert dry["throughMonth"] == "2026-10"
    assert [s["scale"] for s in dry["scales"]] == [1, 3, 6]
    assert all(s["spi"] is not None and s["spi"] < -1.5 for s in dry["scales"])
    # lluvia a ritmo normal: cerca de cero
    normal = compute_spi(_chirps(date(2026, 4, 1), date(2026, 11, 8), 4.0), ref, today)
    assert all(abs(s["spi"]) < 1.5 for s in normal["scales"])
    # solo 40 días de dato: el SPI a 3 y 6 meses queda sin calcular
    short = compute_spi(_chirps(date(2026, 9, 1), date(2026, 11, 8), 4.0), ref, today)
    by_scale = {s["scale"]: s for s in short["scales"]}
    assert by_scale[1]["spi"] is not None
    assert by_scale[3]["spi"] is None and by_scale[3]["reason"] == "chirps_incomplete"
    assert by_scale[6]["reason"] == "chirps_incomplete"
    # sin climatología suficiente
    assert compute_spi(_chirps(date(2026, 4, 1), date(2026, 11, 8), 4.0), {}, today)["scales"][0]["reason"] == "no_reference"
