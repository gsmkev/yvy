import numpy as np
from rasterio.transform import from_origin

from yvy_workers.jobs import fertility
from yvy_workers.jobs.fertility import MIN_POINTS, dedupe_points, fertility_maps, idw, interpolate
from yvy_workers.tiles import index_rgba


class FakeGrid:
    from pyproj import CRS

    crs = CRS.from_epsg(32721)
    transform = from_origin(500_000.0, 7_000_000.0, 10.0, 10.0)


def test_idw_devuelve_el_valor_exacto_en_un_punto_y_promedia_entre_dos():
    xy = np.array([[0.0, 0.0], [100.0, 0.0]])
    v = np.array([10.0, 20.0])
    out = idw(xy, v, np.array([[0.0, 0.0], [50.0, 0.0], [25.0, 0.0]]))
    assert out[0] == 10.0
    assert abs(out[1] - 15.0) < 1e-9  # equidistante
    assert out[2] < 15.0  # más cerca del 10


def test_idw_no_inventa_valores_lejos_de_los_puntos():
    xy = np.array([[0.0, 0.0], [10.0, 0.0]])
    out = idw(xy, np.array([5.0, 6.0]), np.array([[20.0, 0.0], [5_000.0, 0.0]]))
    assert np.isfinite(out[0]) and np.isnan(out[1])


def test_dedupe_se_queda_con_el_analisis_mas_reciente_de_cada_ubicacion():
    pts = [
        {"lon": -55.1, "lat": -25.1, "sampledOn": "2024-01-01", "ph": 5.0},
        {"lon": -55.1, "lat": -25.1, "sampledOn": "2025-01-01", "ph": 6.0},
        {"lon": -55.2, "lat": -25.1, "sampledOn": "2025-01-01", "ph": None},
        {"lon": None, "lat": None, "sampledOn": "2025-01-01", "ph": 7.0},
    ]
    assert dedupe_points(pts, "ph") == [(-55.1, -25.1, 6.0)]


def test_interpolate_solo_pinta_dentro_de_los_lotes():
    from pyproj import Transformer

    g = FakeGrid()
    t = Transformer.from_crs(g.crs, "EPSG:4326", always_xy=True)
    pts = []
    for i, x in enumerate((500_100, 500_300, 500_500)):
        lon, lat = t.transform(x, 6_999_500)
        pts.append((lon, lat, 4.0 + i))
    inside = np.zeros((100, 100), dtype=bool)
    inside[20:60, 20:60] = True
    s = interpolate(g, inside, pts)
    assert np.isnan(s[0, 0]) and np.isfinite(s[30, 30])
    assert 4.0 <= np.nanmin(s) and np.nanmax(s) <= 6.0
    rgba = index_rgba(s, np.isfinite(s), "fert_ph")
    assert rgba.shape == (4, 100, 100) and rgba[3, 0, 0] == 0 and rgba[3, 30, 30] == 255


class FakeApi:
    def __init__(self, points):
        self.points = points

    def soil_points(self, farm_id):
        return self.points

    def farm_geometry(self, farm_id):
        ring = [[-55.0, -25.0], [-54.99, -25.0], [-54.99, -25.01], [-55.0, -25.01], [-55.0, -25.0]]
        poly = {"type": "Polygon", "coordinates": [ring]}
        return {"farm": poly, "plots": [{"id": "p1", "geometry": poly}]}


def test_fertility_maps_publica_solo_los_parametros_con_puntos_suficientes(monkeypatch):
    published = []
    import yvy_workers.jobs.s2 as s2

    monkeypatch.setattr(s2, "publish_layer", lambda api, farm, grid, layer, acquired, rgba: published.append((layer, acquired, rgba.shape)) or 1)
    pts = [
        {"lon": -54.995 + (i % 4) * 0.002 - 0.003, "lat": -25.002 - (i // 4) * 0.002, "sampledOn": "2025-01-01", "ph": 5.0 + i * 0.1, "pMgKg": 10.0 + i, "kCmolKg": None, "omPct": None}
        for i in range(MIN_POINTS)
    ]
    out = fertility_maps(FakeApi(pts), {"id": "f", "name": "F"}, now_ms=123)
    assert out == {"fert_ph": MIN_POINTS, "fert_p": MIN_POINTS}
    assert [p[0] for p in published] == ["fert_ph", "fert_p"] and published[0][1] == 123
    # con uno menos del mínimo no se publica nada
    published.clear()
    assert fertility_maps(FakeApi(pts[: MIN_POINTS - 1]), {"id": "f", "name": "F"}) == {}
    assert published == []


def test_el_minimo_coincide_con_el_de_shared():
    import re
    from pathlib import Path

    src = (Path(__file__).parents[2] / "packages/shared/src/limits.ts").read_text()
    m = re.search(r"fertility:\s*\{[^}]*minPoints:\s*(\d+)", src)
    assert m and int(m.group(1)) == fertility.MIN_POINTS
