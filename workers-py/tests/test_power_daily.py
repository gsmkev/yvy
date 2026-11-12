from datetime import date

import httpx

from yvy_workers.jobs.power_daily import daily_rows, power_daily

PARAMS = {
    "T2M_MIN": {"20260101": 20.5, "20260102": -999.0, "20260103": 19.0},
    "T2M_MAX": {"20260101": 33.1, "20260102": -999.0, "20260103": 31.0},
    "GWETTOP": {"20260101": 0.61, "20260102": -999.0, "20260103": 0.55},
    "GWETROOT": {"20260101": 0.7, "20260102": -999.0, "20260103": 0.66},
}


def test_filas_de_clima_diario_descartan_los_faltantes():
    rows = daily_rows("f1", PARAMS)
    assert [r["date"] for r in rows] == ["2026-01-01", "2026-01-03"]
    assert rows[0] == {
        "farmId": "f1",
        "plotId": "",
        "date": "2026-01-01",
        "source": "nasa_power",
        "tminC": 20.5,
        "tmaxC": 33.1,
        "soilMoisture0_7": 0.61,
        "soilMoisture7_28": 0.7,
    }
    assert "precipMm" not in rows[0]  # la lluvia es de CHIRPS


class FakeApi:
    def __init__(self):
        self.rows: list[dict] = []

    def climate_daily(self, rows):
        self.rows += rows
        return len(rows)


def test_power_daily_pide_la_ventana_y_sigue_si_una_estancia_falla():
    seen: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        q = dict(request.url.params)
        seen.append(q)
        if q["latitude"] == "-1.0":
            return httpx.Response(500)
        return httpx.Response(200, json={"properties": {"parameter": PARAMS}})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    api = FakeApi()
    farms = [
        {"id": "bad", "name": "Mala", "centroidLat": -1.0, "centroidLon": -2.0},
        {"id": "ok", "name": "Buena", "centroidLat": -27.123456, "centroidLon": -55.987654},
    ]
    failures = power_daily(api, farms, days=100, today=date(2026, 11, 11), client=client)  # type: ignore[arg-type]
    assert failures == 1
    assert [r["farmId"] for r in api.rows] == ["ok", "ok"]
    ok = seen[-1]
    assert ok["latitude"] == "-27.1235" and ok["longitude"] == "-55.9877"  # 4 decimales
    assert ok["start"] == "20260803" and ok["end"] == "20261109"
    assert ok["community"] == "AG"
