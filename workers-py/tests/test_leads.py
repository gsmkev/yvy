import json
from datetime import date, timedelta

import httpx

from yvy_workers.ingest import IngestClient, sign
from yvy_workers.jobs.leads import lead_report


def daily(fn, y0=1991, y1=2026):
    out = {}
    d = date(y0, 1, 1)
    while d <= date(y1, 12, 31):
        k = d.strftime("%Y%m%d")
        if k <= "20261105":
            out[k] = fn(d)
        d += timedelta(days=1)
    return out


HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"


def power_ok(req: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"properties": {"parameter": {"T2M_MIN": daily(lambda d: 9.0), "PRECTOTCORR": daily(lambda d: 3.0)}}})


def test_informe_del_pedido_sube_firmado_con_focos_cerca_del_punto():
    sent: list[tuple[str, dict]] = []

    def api_handler(req: httpx.Request) -> httpx.Response:
        body = req.content.decode()
        assert req.headers["x-yvy-signature"] == sign("k", int(req.headers["x-yvy-timestamp"]), req.method, req.url.path, body)
        sent.append((req.url.path, json.loads(body)))
        return httpx.Response(200, json={"ok": True, "sent": True})

    def firms(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=HEADER + f"-27.30,-55.91,330.1,0.4,0.4,2026-09-15,0412,N,VIIRS,n,2.0NRT,290.1,5.2,N\n")

    api = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(api_handler)))
    leads = [{"id": "L1", "lon": -55.9, "lat": -27.3}]
    failures = lead_report(
        api,
        leads,
        map_key="KEY",
        client=httpx.Client(transport=httpx.MockTransport(power_ok)),
        firms_client=httpx.Client(transport=httpx.MockTransport(firms)),
        today=date(2026, 11, 10),
    )
    assert failures == 0
    path, body = sent[0]
    assert path == "/ingest/leads/L1/report"
    assert body["report"]["fire"]["total"] > 0 and body["report"]["frost"]["meanPerYear"] == 0
    assert "email" not in json.dumps(body)


def test_una_falla_no_frena_a_los_demas_y_sin_clave_no_hay_focos():
    sent: list[dict] = []

    def api_handler(req: httpx.Request) -> httpx.Response:
        sent.append(json.loads(req.content.decode()))
        return httpx.Response(200, json={"ok": True})

    def power(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500) if float(req.url.params["latitude"]) > 0 else power_ok(req)

    api = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(api_handler)))
    leads = [{"id": "mala", "lon": -55.9, "lat": 10.0}, {"id": "buena", "lon": -55.9, "lat": -27.3}]
    failures = lead_report(api, leads, map_key="", client=httpx.Client(transport=httpx.MockTransport(power)), today=date(2026, 11, 10))
    assert failures == 1
    assert len(sent) == 1 and sent[0]["report"]["fire"] is None


def test_sin_pedidos_no_hace_nada():
    api = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500))))
    assert lead_report(api, []) == 0
