from datetime import date

import numpy as np
import pytest

from tests.test_jobs import GEOM


def test_indices_ndre_ndmi_evi():
    """S-07: fórmulas de NDRE, NDMI y EVI sobre reflectancias conocidas, y rampas por índice."""
    from yvy_workers.jobs.s2 import compute_indices
    from yvy_workers.tiles import INDEX_STYLE

    shape = (4, 4)

    def f(v):
        return np.full(shape, v, "float32")

    bands = {"red": f(0.05), "nir": f(0.40), "rededge1": f(0.15), "nir08": f(0.45), "swir16": f(0.20), "blue": f(0.03)}
    valid = np.ones(shape, bool)
    valid[0, 0] = False
    res = compute_indices(bands, valid)
    assert set(res) == {"ndvi", "ndre", "ndmi", "evi"}
    assert res["ndvi"][0][1, 1] == pytest.approx((0.40 - 0.05) / 0.45, abs=1e-4)
    assert res["ndre"][0][1, 1] == pytest.approx((0.45 - 0.15) / 0.60, abs=1e-4)
    assert res["ndmi"][0][1, 1] == pytest.approx((0.40 - 0.20) / 0.60, abs=1e-4)
    assert res["evi"][0][1, 1] == pytest.approx(2.5 * 0.35 / (0.40 + 0.30 - 0.225 + 1), abs=1e-4)
    assert not res["ndre"][1][0, 0] and np.isnan(res["ndre"][0][0, 0])  # la máscara se respeta
    assert set(INDEX_STYLE) == {"ndvi", "ndre", "ndmi", "evi"}


def test_capa_de_otro_indice():
    from yvy_workers.tiles import index_rgba

    vals = np.linspace(-0.2, 0.6, 16, dtype="float32").reshape(4, 4)
    rgba = index_rgba(vals, np.ones((4, 4), bool), "ndmi")
    assert rgba.shape == (4, 4, 4) and rgba[3].min() == 255
    assert tuple(rgba[:3, 0, 0]) == (0xD9, 0xA9, 0x3A)  # seco = trigo
    assert tuple(rgba[:3, 3, 3]) == (0x8D, 0xB3, 0xC7)  # húmedo = cielo


def test_historia_recorre_un_anio_por_vez_solo_ndvi(monkeypatch):
    """S-03: desde 2017, un año por vez, y solo pide NDVI."""
    from yvy_workers.jobs import s2

    class Api:
        def farm_geometry(self, _id):
            return GEOM

    windows, wanted = [], []

    def fake_search(bbox, start, end, cloud):
        windows.append((start.year, end.year))
        return []

    def fake_range(api, geom, grid, items, indices=s2.INDICES, farm_id=""):
        wanted.append(indices)
        return {"scenes": 1, "stats": 2}, {}

    monkeypatch.setattr(s2, "search", fake_search)
    monkeypatch.setattr(s2, "ingest_range", fake_range)
    farm = {"id": "f", "name": "F", "minLon": -56, "minLat": -27.3, "maxLon": -55.8, "maxLat": -27.1}
    total = s2.s2_history(Api(), farm, today=date(2019, 6, 1))
    assert windows == [(2017, 2017), (2018, 2018), (2019, 2019)]
    assert set(wanted) == {("ndvi",)}
    assert total == {"scenes": 3, "stats": 6}
