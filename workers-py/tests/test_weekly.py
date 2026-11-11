import json
from datetime import date
from pathlib import Path

import httpx

from yvy_workers.ingest import IngestClient, sign
from yvy_workers.jobs.weekly import build_pdf, fmt_num, ndvi_color, vigor_change, week_range, weekly_report


def square(lon, lat, d):
    return {"type": "Polygon", "coordinates": [[[lon, lat], [lon + d, lat], [lon + d, lat - d], [lon, lat - d], [lon, lat]]]}


SUMMARY = {
    "farm": {"name": "La Esperanza", "areaHa": 1200.5, "department": "Itapúa", "district": "Capitán Meza"},
    "period": {"from": "2026-11-02", "to": "2026-11-08"},
    "records": {"total": 14, "authors": 3, "byKind": [{"kind": "rain", "n": 6}, {"kind": "pest", "n": 8}]},
    "rain": {"satMm": 42.5, "normalMm": 30.0, "gaugeMm": 38.0},
    "alerts": [{"kind": "frost", "severity": "watch", "summary": "Posible helada el jueves"}],
    "plots": [
        {"id": "a", "name": "Lote 1", "crop": "soja", "kind": "crop", "areaHa": 80, "ndvi": 0.72, "ndviPrev": 0.70},
        {"id": "b", "name": "Lote 2", "crop": None, "kind": "pasture", "areaHa": 60, "ndvi": 0.41, "ndviPrev": 0.62},
        {"id": "c", "name": "Lote 3", "crop": "maíz", "kind": "crop", "areaHa": 30, "ndvi": None, "ndviPrev": None},
    ],
    "problemAreas": [{"plotName": "Lote 2", "areaHa": 3.2}],
}
GEO = [{"id": "a", "geometry": square(-55.95, -27.15, 0.02)}, {"id": "b", "geometry": square(-55.92, -27.15, 0.02)}, {"id": "c", "geometry": square(-55.89, -27.15, 0.02)}]


def test_semana_anterior_de_lunes_a_domingo():
    assert week_range(date(2026, 11, 9)) == ("2026-11-02", "2026-11-08")  # lunes
    assert week_range(date(2026, 11, 11)) == ("2026-11-02", "2026-11-08")  # miércoles
    assert week_range(date(2026, 11, 8)) == ("2026-10-26", "2026-11-01")  # domingo


def test_formatos_y_rampa():
    assert fmt_num(1234.5, 0, "ha") == "1.234 ha" or fmt_num(1234.5, 0, "ha") == "1.235 ha"
    assert fmt_num(0.724, 2) == "0,72"
    assert fmt_num(None) == "—"
    assert vigor_change(0.4, 0.8) == -50
    assert vigor_change(None, 0.5) is None and vigor_change(0.5, 0) is None
    assert ndvi_color(0.1).hexval() != ndvi_color(0.9).hexval()
    assert ndvi_color(None).hexval() == "0xc9c4b2"


def test_pdf_se_genera_con_datos_y_vacio(tmp_path: Path):
    out = build_pdf(SUMMARY, GEO, tmp_path / "a.pdf")
    data = out.read_bytes()
    assert data[:4] == b"%PDF" and len(data) > 2000
    empty = {**SUMMARY, "records": {"total": 0, "authors": 0, "byKind": []}, "rain": {"satMm": None, "normalMm": None, "gaugeMm": None}, "alerts": [], "plots": [], "problemAreas": []}
    assert build_pdf(empty, [], tmp_path / "b.pdf").read_bytes()[:4] == b"%PDF"


def test_job_sube_y_registra_solo_las_estancias_con_destinatario():
    calls: list[tuple[str, str]] = []
    registered: list[dict] = []

    def handler(req: httpx.Request) -> httpx.Response:
        ts = req.headers["x-yvy-timestamp"]
        # la firma cubre la ruta, no la query (igual que el Worker)
        assert req.headers["x-yvy-signature"] == sign("k", int(ts), req.method, req.url.path, req.content.decode())
        calls.append((req.method, req.url.path))
        if req.url.path.endswith("/weekly-summary"):
            assert dict(req.url.params) == {"from": "2026-11-02", "to": "2026-11-08"}
            return httpx.Response(200, json=SUMMARY)
        if req.url.path.endswith("/geometry"):
            return httpx.Response(200, json={"farm": square(-55.95, -27.15, 0.1), "plots": GEO})
        registered.append(json.loads(req.content))
        return httpx.Response(201, json={"ok": True})

    uploaded: list[tuple[str, int]] = []

    def upload(path: Path, key: str) -> None:
        uploaded.append((key, path.stat().st_size))

    api = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(handler)))
    farms = [
        {"id": "f1", "name": "Con dueño", "hasReportRecipient": True},
        {"id": "f2", "name": "Sin email", "hasReportRecipient": False},
    ]
    assert weekly_report(api, farms, today=date(2026, 11, 9), upload=upload) == 0
    assert len(uploaded) == 1 and uploaded[0][1] > 2000
    key = uploaded[0][0]
    assert key.startswith("reports/f1/") and key.endswith("/parte-2026-11-08.pdf")
    assert registered == [{"farmId": "f1", "periodStart": "2026-11-02", "periodEnd": "2026-11-08", "storagePath": key}]
    assert not any("f2" in p for _, p in calls)


def test_si_falla_una_estancia_sigue_con_las_demas():
    def handler(req: httpx.Request) -> httpx.Response:
        if "/f1/" in req.url.path:
            return httpx.Response(500)
        if req.url.path.endswith("/weekly-summary"):
            return httpx.Response(200, json=SUMMARY)
        if req.url.path.endswith("/geometry"):
            return httpx.Response(200, json={"farm": {}, "plots": GEO})
        return httpx.Response(201, json={"ok": True})

    done: list[str] = []
    api = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(handler)))
    farms = [{"id": "f1", "name": "Mala", "hasReportRecipient": True}, {"id": "f2", "name": "Buena", "hasReportRecipient": True}]
    assert weekly_report(api, farms, today=date(2026, 11, 9), upload=lambda p, k: done.append(k)) == 1
    assert len(done) == 1 and done[0].startswith("reports/f2/")
