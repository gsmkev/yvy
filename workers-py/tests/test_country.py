import numpy as np
from rasterio.transform import from_origin

from yvy_workers.jobs import country


def item(mgrs: str, cloud: float, i: int) -> dict:
    return {"id": f"S2A_{mgrs}_{i}", "properties": {"grid:code": f"MGRS-{mgrs}", "eo:cloud_cover": cloud}}


def test_bloques_cubren_el_pais_sin_huecos():
    cs = country.chunks()
    area = sum((c[2] - c[0]) * (c[3] - c[1]) for c in cs)
    b = country.BBOX
    assert abs(area - (b[2] - b[0]) * (b[3] - b[1])) < 1e-6
    assert all(c[2] <= b[2] + 1e-9 and c[3] <= b[3] + 1e-9 for c in cs)


def test_elige_las_menos_nubladas_por_tesela():
    items = [item("21JUN", c, i) for i, c in enumerate([15, 2, 9, 1])] + [item("21JVN", 18, 9)]
    got = country.pick(items, per_tile=2)
    assert sorted(i["properties"]["eo:cloud_cover"] for i in got) == [1, 2, 18]


def test_composite_usa_mediana_y_respaldo(monkeypatch):
    # SCL: 4 (vegetación) en la primera escena; nube (9) en la segunda solo en la mitad izquierda
    def fake_read(href, transform, w, h, level, resampling):
        n = int(href.split("/")[0])
        if href.endswith("scl"):
            a = np.full((h, w), 4, dtype=np.uint8)
            if n == 1:
                a[:, : w // 2] = 9
            return a
        return np.full((h, w), 1000 * (n + 1), dtype=np.uint16)

    monkeypatch.setattr(country, "_read", fake_read)
    monkeypatch.setattr(country, "dilate", lambda m, px: m)
    its = []
    for n in (0, 1):
        assets = {b: {"href": f"{n}/{b}", "raster:bands": [{"scale": 0.0001, "offset": 0}]} for b in ("red", "green", "blue", "scl")}
        its.append({"id": str(n), "properties": {}, "assets": assets})
    out = country.composite(its, from_origin(0, 0, 1, 1), 4, 2)
    assert out.shape == (4, 2, 4)
    assert (out[3] == 255).all()
    # izquierda: solo la escena 0 (0.1); derecha: mediana de 0.1 y 0.2 → más brillante
    assert out[0, 0, 0] < out[0, 0, 3]
