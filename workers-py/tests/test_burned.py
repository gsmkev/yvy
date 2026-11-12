from datetime import datetime, timezone

import numpy as np
import pytest

from tests.test_jobs import GEOM
from yvy_workers.jobs import burned
from yvy_workers.jobs.s2 import make_grid

DAY = 86_400_000
T0 = int(datetime(2026, 8, 10, 12, tzinfo=timezone.utc).timestamp() * 1000)


def hot(days, lon=-55.94, lat=-27.16):
    return {"acquiredAt": T0 + days * DAY, "lon": lon, "lat": lat, "confidence": "h"}


def test_focos_se_agrupan_en_incendios():
    events = burned.group_events([hot(0), hot(1), hot(3), hot(40), hot(41)])
    assert len(events) == 2
    assert events[0].first_at == T0 and events[0].last_at == T0 + 3 * DAY and len(events[0].points) == 3
    assert events[0].key == "2026-08-10"
    assert burned.group_events([]) == []


def test_nbr_y_clases_de_severidad():
    nir = np.array([[0.40, 0.40, 0.40]], "float32")
    swir = np.array([[0.10, 0.10, 0.10]], "float32")
    valid = np.array([[True, True, False]])
    pre = burned.nbr(nir, swir, valid)
    assert pre[0, 0] == pytest.approx(0.6, abs=1e-4) and np.isnan(pre[0, 2])
    # después: sin cambio, quemado moderado (dNBR 0,4), quemado alto (dNBR 0,8)
    post = np.array([[0.6, 0.2, -0.2]], "float32")
    pre3 = np.array([[0.6, 0.6, 0.6]], "float32")
    v, mod, high = burned.classify_burn(pre3, post)
    assert v.all()
    assert mod.tolist() == [[False, True, False]] and high.tolist() == [[False, False, True]]


def test_area_quemada_por_lote_con_poligono_y_lote_lejano_sin_resultado():
    grid = make_grid(GEOM)
    shape = (grid.height, grid.width)
    pre = np.full(shape, 0.6, "float32")
    post = pre.copy()
    # Quema: la mitad del lote "a" (el de más al oeste) con severidad moderada y una franja con severidad alta
    inside_a = np.zeros(shape, bool)
    from rasterio.features import geometry_mask

    inside_a = geometry_mask([grid.plots[0][1]], out_shape=shape, transform=grid.transform, invert=True)
    rows, cols = np.where(inside_a)
    mid = (rows.min() + rows.max()) // 2
    burned_px = inside_a & (np.arange(shape[0])[:, None] <= mid)
    post[burned_px] = 0.2  # dNBR 0,4
    post[burned_px & (np.arange(shape[0])[:, None] <= rows.min() + 20)] = -0.2  # dNBR 0,8
    event = burned.group_events([hot(0, lon=-55.94, lat=-27.16)])[0]
    res = {r["plotId"]: r for r in burned.analyze_burn(pre, post, grid, event)}
    a = res["a"]
    assert a["hotspots"] == 1 and a["validPct"] == 100
    assert 0.4 * a["plotAreaHa"] < a["burnedHa"] < 0.6 * a["plotAreaHa"]
    assert 0 < a["highHa"] < a["burnedHa"]
    assert {c["severity"] for c in a["changes"]} == {"moderate", "high"}
    assert all(c["geometry"]["type"] == "Polygon" for c in a["changes"])
    # el lote "b" está a ~1,5 km del foco: no se informa
    assert "b" not in res


def test_nube_en_el_lote_deja_sin_datos_y_no_inventa_quemado():
    grid = make_grid(GEOM)
    shape = (grid.height, grid.width)
    pre = np.full(shape, 0.6, "float32")
    post = np.full(shape, np.nan, "float32")
    event = burned.group_events([hot(0)])[0]
    (a,) = burned.analyze_burn(pre, post, grid, event)
    assert a["validPct"] == 0 and a["burnedHa"] == 0 and a["changes"] == []


def test_job_sube_resultado_y_espera_la_imagen_de_despues(monkeypatch):
    sent = []

    class Api:
        def farm_hotspots(self, farm_id, days):
            return [hot(0)]

        def farm_geometry(self, farm_id):
            return GEOM

        def analysis(self, r):
            sent.append(r)

    items = lambda day: {"properties": {"datetime": datetime.fromtimestamp((T0 + day * DAY) / 1000, tz=timezone.utc).isoformat()}}  # noqa: E731
    monkeypatch.setattr(burned, "search", lambda bbox, start, end, cloud: [items(-5)] if end <= datetime.fromtimestamp(T0 / 1000, tz=timezone.utc) else [items(8)])
    grid_shape = {}

    def fake_composite(its, grid):
        grid_shape["s"] = (grid.height, grid.width)
        return np.full((grid.height, grid.width), 0.6 if its[0]["properties"]["datetime"] < items(0)["properties"]["datetime"] else 0.1, "float32")

    monkeypatch.setattr(burned, "_composite", fake_composite)
    farm = {"id": "f", "name": "F", "minLon": -56, "minLat": -27.3, "maxLon": -55.8, "maxLat": -27.1}
    # Aún no pasaron 5 días desde el último foco: no hace nada
    assert burned.burned_area(Api(), farm, now=datetime.fromtimestamp((T0 + 2 * DAY) / 1000, tz=timezone.utc)) == 0 and not sent
    n = burned.burned_area(Api(), farm, now=datetime.fromtimestamp((T0 + 12 * DAY) / 1000, tz=timezone.utc))
    assert n == 1 and len(sent) == 1
    r = sent[0]
    assert r["kind"] == "burned" and r["refKey"] == "2026-08-10" and r["plotId"] == "a"
    assert r["metrics"]["burnedHa"] == pytest.approx(r["plotAreaHa"], rel=0.05)
    assert r["fromAt"] < T0 < r["toAt"]
