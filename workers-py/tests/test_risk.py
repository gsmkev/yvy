from datetime import date, datetime, timedelta, timezone

import httpx
import pytest

from yvy_workers.ingest import IngestClient, sign
from yvy_workers.jobs.risk import (
    build_report,
    dry_stats,
    fetch_hotspot_history,
    fire_stats,
    firms_windows,
    frost_stats,
    longest_run,
    parse_series,
    rain_stats,
    risk_report,
)


def square(lon, lat, d):
    return {"type": "Polygon", "coordinates": [[[lon, lat], [lon + d, lat], [lon + d, lat - d], [lon, lat - d], [lon, lat]]]}


FARM = square(-55.95, -27.15, 0.06)


def daily(fn, y0=1991, y1=2020):
    """{'AAAAMMDD': valor} para todos los días de y0 a y1."""
    out = {}
    d = date(y0, 1, 1)
    while d <= date(y1, 12, 31):
        out[d.strftime("%Y%m%d")] = fn(d)
        d += timedelta(days=1)
    return out


def test_parse_series_descarta_faltantes():
    s = parse_series({"20200101": 3.5, "20200102": -999.0, "20200103": None})
    assert s == {date(2020, 1, 1): 3.5}


def test_heladas_por_anio_y_fechas_tipicas():
    # Heladas el 5 de junio y el 10 de agosto de cada año; 2000 tiene además 3 días en julio
    def tmin(d):
        if (d.month, d.day) in ((6, 5), (8, 10)):
            return 0.5
        if d.year == 2000 and d.month == 7 and d.day <= 3:
            return -1.0
        return 12.0

    st = frost_stats(parse_series(daily(tmin)))
    assert len(st["perYear"]) == 30
    assert st["perYear"][0] == {"year": 1991, "days": 2}
    assert st["worst"] == {"year": 2000, "days": 5}
    assert st["meanPerYear"] == pytest.approx(2.1, abs=0.01)
    assert st["yearsWithFrostPct"] == 100
    assert st["typicalLastFrost"] == "06-05"
    assert st["typicalFirstFrost"] == "07-01" or st["typicalFirstFrost"] == "08-10"


def test_anios_sin_dato_no_cuentan_como_sin_heladas():
    st = frost_stats(parse_series({"19910101": 1.0, "19910102": 1.0}))
    assert st["perYear"] == [] and st["meanPerYear"] == 0 and st["worst"] is None


def test_lluvia_normal_mensual_y_ultimos_12_meses():
    # 1 mm por día todo el período normal; 2 mm por día desde 2021
    raw = daily(lambda d: 1.0 if d.year <= 2020 else 2.0, 1991, 2026)
    precip = parse_series({k: v for k, v in raw.items() if k <= "20261105"})
    st = rain_stats(precip, date(2026, 11, 8))
    jan = st["normal"][0]
    assert jan["month"] == 1 and jan["meanMm"] == 31.0 and jan["p20Mm"] == 31.0
    assert st["annualMeanMm"] == pytest.approx(365, abs=1)
    # noviembre quedó incompleto: el último mes completo es octubre de 2026
    assert st["recent"][-1] == {"month": "2026-10", "mm": 62.0}
    assert st["recent"][0]["month"] == "2025-11"
    assert len(st["recent"]) == 12


def test_rachas_secas():
    p = {date(2020, 1, 1) + timedelta(days=i): 0.0 for i in range(40)}
    p[date(2020, 1, 11)] = 20.0  # corta en 10 y 29 días
    p[date(2020, 1, 12)] = 20.0
    longest, spells = longest_run(p, date(2020, 1, 1), date(2020, 2, 9))
    assert longest == 28 and spells == 1  # del 13 de enero al 9 de febrero


def test_sequia_por_anio_y_por_verano():
    # Cada año llueve 10 mm cada 5 días, salvo 1995: 30 días seguidos secos en enero
    def mm(d):
        if d.year == 1995 and d.month == 1:
            return 0.0
        return 10.0 if d.toordinal() % 5 == 0 else 0.0

    st = dry_stats(parse_series(daily(mm)))
    assert st["worst"]["year"] == 1995 and st["worst"]["days"] >= 31
    assert st["meanLongestDays"] < 5
    assert st["spells15PerYear"] == pytest.approx(1 / 30, abs=0.01)
    assert st["thresholdMm"] == 1.0


def test_ventanas_de_firms_en_tramos_de_5_dias():
    today = date(2026, 11, 10)
    w = firms_windows(today - timedelta(days=365 * 3), today, today)
    assert all(n <= 5 for _, _, n in w)
    assert sum(n for _, _, n in w) == 365 * 3 + 1
    assert w[0][0] == "VIIRS_SNPP_SP" and w[-1][0] == "VIIRS_SNPP_NRT"


HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"


def row(lat, lon, day, conf="n"):
    return f"{lat},{lon},330.1,0.4,0.4,{day},0412,N,VIIRS,{conf},2.0NRT,290.1,5.2,N\n"


def test_focos_a_menos_de_10_km_por_ano_y_mes():
    from yvy_workers.jobs.firms import parse_csv

    today = date(2026, 11, 10)
    csv = HEADER + "".join(
        [
            row(-27.16, -55.97, "2026-09-15"),  # adentro
            row(-27.16, -55.97, "2025-09-20"),  # adentro, año anterior
            row(-27.20, -56.02, "2024-08-01"),  # ~7 km al suroeste
            row(-27.35, -55.90, "2026-09-15"),  # ~20 km: afuera
            row(-27.16, -55.97, "2026-09-16", "l"),  # baja confianza: se descarta al leer
        ]
    )
    res = fire_stats(FARM, parse_csv(csv, "VIIRS_SNPP_SP"), today)
    assert res["total"] == 3
    assert [w["count"] for w in res["perYear"]] == [1, 1, 1]
    assert res["byMonth"][8] == 2 and res["byMonth"][7] == 1
    assert res["nearestKm"] == pytest.approx(2.0, abs=0.2)
    assert res["radiusKm"] == 10.0
    assert res["lastAt"] == int(datetime(2026, 9, 15, 4, 12, tzinfo=timezone.utc).timestamp() * 1000)


def test_fire_stats_sin_focos():
    res = fire_stats(FARM, [], date(2026, 11, 10))
    assert res["total"] == 0 and res["nearestKm"] is None and res["lastAt"] is None


def test_descarga_firms_junta_tramos_y_tolera_fallas():
    today = date(2026, 11, 10)
    calls: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(str(req.url))
        if len(calls) == 3:
            return httpx.Response(500, text="boom")
        return httpx.Response(200, text=HEADER + row(-27.16, -55.97, "2026-09-15"))

    c = httpx.Client(transport=httpx.MockTransport(handler))
    hs = fetch_hotspot_history("KEY", today, c)
    assert len(hs) == len(calls) - 1
    assert "/KEY/VIIRS_SNPP_SP/" in calls[0] and "/5/" in calls[0]
    assert any("VIIRS_SNPP_NRT" in u for u in calls)


def test_build_report_forma_y_json():
    import json

    power = {"T2M_MIN": daily(lambda d: 10.0), "PRECTOTCORR": daily(lambda d: 2.0, 1991, 2026)}
    power["PRECTOTCORR"] = {k: v for k, v in power["PRECTOTCORR"].items() if k <= "20261105"}
    rep = build_report(power, date(2026, 11, 8), None, now_ms=123)
    assert rep["version"] == 1 and rep["generatedAt"] == 123 and rep["fire"] is None
    assert rep["frost"]["meanPerYear"] == 0
    assert len(rep["rain"]["normal"]) == 12
    assert len(json.dumps(rep)) < 8000


def test_risk_report_sube_con_firma_y_cuenta_fallas():
    today = date(2026, 11, 10)
    sent: list[dict] = []

    def api_handler(req: httpx.Request) -> httpx.Response:
        body = req.content.decode()
        ts = req.headers["x-yvy-timestamp"]
        assert req.headers["x-yvy-signature"] == sign("k", int(ts), req.method, req.url.path, body)
        if req.url.path.endswith("/geometry"):
            return httpx.Response(200, json={"farm": FARM, "plots": []})
        import json

        sent.append(json.loads(body))
        return httpx.Response(200, json={"ok": True})

    def power_handler(req: httpx.Request) -> httpx.Response:
        lat = float(req.url.params["latitude"])
        if lat > 0:
            return httpx.Response(500)
        return httpx.Response(200, json={"properties": {"parameter": {"T2M_MIN": daily(lambda d: 9.0), "PRECTOTCORR": daily(lambda d: 3.0)}}})

    def firms_handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=HEADER + row(-27.16, -55.97, "2026-09-15"))

    api = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(api_handler)))
    farms = [
        {"id": "f1", "name": "Buena", "centroidLat": -27.18, "centroidLon": -55.92},
        {"id": "f2", "name": "Mala", "centroidLat": 10.0, "centroidLon": -55.92},
    ]
    failures = risk_report(
        api,
        farms,
        map_key="KEY",
        client=httpx.Client(transport=httpx.MockTransport(power_handler)),
        firms_client=httpx.Client(transport=httpx.MockTransport(firms_handler)),
        today=today,
    )
    assert failures == 1
    assert len(sent) == 1 and sent[0]["farmId"] == "f1"
    assert sent[0]["report"]["fire"]["total"] > 0


def test_risk_report_sin_clave_de_firms_sale_sin_fuego():
    sent: list[dict] = []

    def api_handler(req: httpx.Request) -> httpx.Response:
        import json

        sent.append(json.loads(req.content.decode()))
        return httpx.Response(200, json={"ok": True})

    power = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"properties": {"parameter": {"T2M_MIN": daily(lambda d: 9.0), "PRECTOTCORR": daily(lambda d: 3.0)}}})))
    api = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(api_handler)))
    assert risk_report(api, [{"id": "f1", "name": "A", "centroidLat": -27.0, "centroidLon": -55.0}], map_key="", client=power, today=date(2026, 11, 10)) == 0
    assert sent[0]["report"]["fire"] is None
