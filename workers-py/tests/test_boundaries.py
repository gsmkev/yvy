import json

from yvy_workers.jobs.boundaries import dump, simplify_collection

RING = [[0, 0], [1.00004, 0.00001], [2, 0], [2, 2], [0, 2], [0, 0]]


def fc(name="Itapúa"):
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"shapeName": name, "shapeID": "x", "shapeGroup": "PRY"}, "geometry": {"type": "Polygon", "coordinates": [RING]}},
            {"type": "Feature", "properties": {"shapeID": "sin-nombre"}, "geometry": {"type": "Polygon", "coordinates": [RING]}},
        ],
    }


def test_deja_solo_nombre_y_descarta_sin_nombre():
    out = simplify_collection(fc(), 0.01)
    assert [f["properties"] for f in out["features"]] == [{"name": "Itapúa"}]


def test_simplifica_y_redondea():
    out = simplify_collection(fc(), 0.01)
    ring = out["features"][0]["geometry"]["coordinates"][0]
    assert len(ring) == 5  # el vértice casi colineal desaparece
    assert all(len(str(c).split(".")[-1]) <= 4 for p in ring for c in p)


def test_serializa_compacto_y_con_acentos():
    body = dump(simplify_collection(fc(), 0.01))
    assert "Itapúa".encode() in body and b" " not in body
    assert json.loads(body)["type"] == "FeatureCollection"
