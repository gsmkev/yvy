from datetime import date

import numpy as np
import pytest
from rasterio.features import geometry_mask

from tests.test_jobs import GEOM
from yvy_workers.jobs import cover
from yvy_workers.jobs.cover import CROP, FOREST, INVALID, OTHER, PASTURE, classify_cover
from yvy_workers.jobs.s2 import make_grid


def px(ndvi, ndmi, amp, nobs=10):
    f = lambda v: np.array([[v]], "float32")  # noqa: E731
    return classify_cover(f(ndvi), f(ndmi), f(amp), np.array([[nobs]]))[0, 0]


def test_clases_simples():
    assert px(0.8, 0.3, 0.1) == FOREST  # NDVI alto, húmedo y estable
    assert px(0.8, 0.3, 0.4) == CROP  # NDVI alto pero con mucha amplitud en la ventana
    assert px(0.5, 0.0, 0.15) == PASTURE
    assert px(0.8, 0.0, 0.1) == PASTURE  # verde pero seco: no es monte
    assert px(0.15, 0.0, 0.05) == OTHER  # suelo desnudo, agua
    assert px(0.8, 0.3, 0.1, nobs=2) == INVALID  # pocas observaciones
    assert classify_cover(np.array([[np.nan]], "float32"), np.array([[0.2]], "float32"), np.array([[0.1]], "float32"), np.array([[9]]))[0, 0] == INVALID


def test_monte_a_pastura_y_cultivo_por_lote():
    grid = make_grid(GEOM)
    shape = (grid.height, grid.width)
    a = np.full(shape, FOREST, "uint8")
    b = a.copy()
    inside = geometry_mask([grid.plots[0][1]], out_shape=shape, transform=grid.transform, invert=True)
    rows = np.where(inside)[0]
    third = rows.min() + (rows.max() - rows.min()) // 3
    two_thirds = rows.min() + 2 * (rows.max() - rows.min()) // 3
    r = np.arange(shape[0])[:, None]
    b[inside & (r <= third)] = PASTURE
    b[inside & (r > third) & (r <= two_thirds)] = CROP
    res = {x["plotId"]: x for x in cover.analyze_cover(a, b, grid)}
    pa, pb = res["a"], res["b"]
    area = pa["plotAreaHa"]
    assert pa["from"]["forest"] == pytest.approx(area, rel=0.02)
    assert pa["forestToPasture"] == pytest.approx(area / 3, rel=0.1)
    assert pa["forestToCrop"] == pytest.approx(area / 3, rel=0.1)
    assert pa["forestToOther"] == 0
    assert pa["to"]["forest"] == pytest.approx(area / 3, rel=0.1)
    assert pa["changes"] and all(c["areaHa"] >= 0.5 for c in pa["changes"])
    # el lote "b" sigue siendo monte: sin cambio
    assert pb["forestToPasture"] == pb["forestToCrop"] == 0 and pb["changes"] == []


def test_nubes_o_sin_dato_no_inventan_cambio():
    grid = make_grid(GEOM)
    shape = (grid.height, grid.width)
    a = np.full(shape, FOREST, "uint8")
    b = np.full(shape, INVALID, "uint8")
    for r in cover.analyze_cover(a, b, grid):
        assert r["validPct"] == 0 and r["forestToPasture"] == 0 and r["from"]["forest"] == 0 and r["changes"] == []


def test_parches_de_menos_de_media_hectarea_no_cuentan():
    grid = make_grid(GEOM)
    shape = (grid.height, grid.width)
    a = np.full(shape, FOREST, "uint8")
    b = a.copy()
    inside = geometry_mask([grid.plots[0][1]], out_shape=shape, transform=grid.transform, invert=True)
    r0, c0 = [int(v[len(v) // 2]) for v in np.where(inside)]
    b[r0 : r0 + 2, c0 : c0 + 2] = PASTURE  # 4 píxeles = 0,04 ha
    pa = {x["plotId"]: x for x in cover.analyze_cover(a, b, grid)}["a"]
    assert pa["forestToPasture"] == 0 and pa["changes"] == []


def test_fechas_validas():
    cover.validate_dates(date(2020, 12, 31), date(2026, 10, 31), today=date(2026, 11, 11))
    for bad in ((date(2016, 1, 1), date(2020, 1, 1)), (date(2020, 1, 1), date(2030, 1, 1)), (date(2020, 1, 1), date(2020, 2, 1))):
        with pytest.raises(ValueError):
            cover.validate_dates(*bad, today=date(2026, 11, 11))


def test_job_sube_una_fila_por_lote_con_la_referencia(monkeypatch):
    sent = []

    class Api:
        def farm_geometry(self, _id):
            return GEOM

        def analysis(self, r):
            sent.append(r)

    def fake_stack(farm, center, grid, now=None):
        shape = (grid.height, grid.width)
        forest = center.year < 2023
        return cover.CoverStack(
            np.full(shape, 0.8 if forest else 0.4, "float32"),
            np.full(shape, 0.3, "float32"),
            np.full(shape, 0.1, "float32"),
            np.full(shape, 9),
            9,
            1,
            2,
        )

    monkeypatch.setattr(cover, "build_stack", fake_stack)
    farm = {"id": "f", "name": "F", "minLon": -56, "minLat": -27.3, "maxLon": -55.8, "maxLat": -27.1}
    assert cover.cover_change(Api(), farm, date(2020, 12, 31), date(2025, 12, 31)) == 2
    assert {r["refKey"] for r in sent} == {"2020-12-31_2025-12-31"}
    r = sent[0]
    assert r["kind"] == "cover_change" and set(r["metrics"]) == {"from", "to", "forestToPasture", "forestToCrop", "forestToOther"}
    assert r["metrics"]["forestToPasture"] == pytest.approx(r["plotAreaHa"], rel=0.05)
