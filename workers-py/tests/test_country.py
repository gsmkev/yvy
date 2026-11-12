import numpy as np
from pmtiles.reader import MmapSource, Reader
from rasterio.transform import from_origin

from yvy_workers.jobs import country
from yvy_workers.jobs.s2 import natural_color


def item(mgrs: str, cloud: float, i: int) -> dict:
    return {"id": f"S2A_{mgrs}_{i}", "properties": {"grid:code": f"MGRS-{mgrs}", "eo:cloud_cover": cloud}}


def test_bloques_cubren_el_pais():
    bs = country.blocks()
    xs = {x for x, _ in bs}
    ys = {y for _, y in bs}
    assert len(bs) == len(xs) * len(ys)
    # las cuatro esquinas del país caen en algún bloque
    for lon, lat in [(-62.6, -19.3), (-54.3, -27.6), (-57.6, -25.3)]:
        assert country.lonlat_tile(lon, lat, country.BLOCK_Z) in bs


def test_tesela_en_mercator_y_lonlat_coinciden():
    x, y = country.lonlat_tile(-57.6, -25.3, 10)
    lon0, lat0, lon1, lat1 = country.tile_lonlat_bbox(x, y, 10)
    assert lon0 <= -57.6 <= lon1 and lat0 <= -25.3 <= lat1
    b = country.tile_bounds_3857(x, y, 10)
    assert abs((b[2] - b[0]) - 2 * country.HALF / 1024) < 1e-6


def test_elige_las_menos_nubladas_por_tesela():
    items = [item("21JUN", c, i) for i, c in enumerate([15, 2, 9, 1])] + [item("21JVN", 18, 9)]
    got = country.pick(items, per_tile=2)
    assert sorted(i["properties"]["eo:cloud_cover"] for i in got) == [1, 2, 18]


def test_composite_usa_mediana_sin_nubes(monkeypatch):
    # escena 1 tiene nube (SCL 9) en la mitad izquierda: ahí solo cuenta la escena 0
    def fake_read(href, transform, w, h, level, resampling):
        n = int(href.split("/")[0])
        if href.endswith("scl"):
            a = np.full((h, w), 4, dtype=np.uint8)
            if n == 1:
                a[:, : w // 2] = 9
            return a
        return np.full((h, w), 500 * (n + 1), dtype=np.uint16)

    monkeypatch.setattr(country, "_read", fake_read)
    monkeypatch.setattr(country, "dilate", lambda m, px: m)
    its = []
    for n in (0, 1):
        assets = {b: {"href": f"{n}/{b}", "raster:bands": [{"scale": 0.0001, "offset": 0}]} for b in ("red", "green", "blue", "scl")}
        its.append({"id": str(n), "properties": {}, "assets": assets})
    out = country.composite(its, from_origin(0, 0, 1, 1), 4, 2)
    assert out.shape == (4, 2, 4)
    assert (out[3] == 255).all()
    assert out[0, 0, 0] < out[0, 0, 3]


def test_reducir_respeta_el_alfa():
    img = np.zeros((4, 4, 4), dtype=np.uint8)
    img[:3, :, :2] = 200
    img[3, :, :2] = 255  # mitad izquierda con dato, derecha transparente
    img[3, 0, 2] = 255  # un solo píxel suelto a la derecha: no alcanza para dar dato
    out = country.downsample(img)
    assert out.shape == (4, 2, 2)
    assert (out[0, :, 0] == 200).all() and (out[3, :, 0] == 255).all()
    assert (out[3, :, 1] == 0).all()


def test_piramide_y_archivo(tmp_path):
    tiles = tmp_path / "tiles"
    tiles.mkdir()
    tile = np.zeros((4, 256, 256), dtype=np.uint8)
    tile[1] = 120
    tile[3] = 255
    x, y = country.lonlat_tile(-57.6, -25.3, 10)
    country.cut(tile, x, y, 10, tiles)
    country.pyramid({(x, y): tile}, tiles)
    path = tmp_path / "p.pmtiles"
    country.write_archive(tiles, path)
    with open(path, "rb") as f:
        r = Reader(MmapSource(f))
        assert r.header()["min_zoom"] == country.MIN_ZOOM
        assert r.get(10, x, y)
        assert r.get(4, x >> 6, y >> 6)


def test_color_natural_da_alfa_solo_con_dato():
    rgb = np.full((3, 1, 2), 0.1, dtype="float32")
    rgb[:, 0, 1] = np.nan
    out = natural_color(rgb)
    assert out[3, 0, 0] == 255 and out[3, 0, 1] == 0
    assert 0 < out[0, 0, 0] < 255
