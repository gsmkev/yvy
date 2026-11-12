import httpx
import numpy as np
import pytest

from yvy_workers.geo import load
from yvy_workers.ingest import IngestClient
from yvy_workers.jobs.problems import find_problem_areas
from yvy_workers.jobs.s2 import make_grid, upload_problem_areas

from test_jobs import GEOM  # dos lotes de ~2 km


def setup():
    grid = make_grid(GEOM)
    ndvi = np.full((grid.height, grid.width), 0.8, dtype="float32")
    ok = np.ones_like(ndvi, bool)
    return grid, ndvi, ok


def _find(grid, ndvi, ok):
    return find_problem_areas(ndvi, ok, grid.plots, grid.transform, grid.crs, grid.width, grid.height)


def block(grid, plot_idx, rows, cols):
    """Ubica un bloque de píxeles dentro del lote: devuelve los slices (fila, columna) desde su esquina noroeste."""
    from rasterio.features import geometry_mask

    inside = geometry_mask([grid.plots[plot_idx][1]], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
    r, c = np.argwhere(inside).min(axis=0)
    return slice(r + 10, r + 10 + rows), slice(c + 10, c + 10 + cols)


def test_detecta_un_area_de_2_ha_muy_por_debajo_de_la_mediana():
    grid, ndvi, ok = setup()
    r, c = block(grid, 0, 15, 15)  # 15x15 px de 10 m = 2,25 ha
    ndvi[r, c] = 0.4  # 0,4 por debajo de la mediana de 0,8
    areas = _find(grid, ndvi, ok)
    assert len(areas) == 1
    a = areas[0]
    assert a["plotId"] == "a"
    assert a["areaHa"] == pytest.approx(2.25, abs=0.05)
    assert a["meanNdvi"] == pytest.approx(0.4, abs=0.01)
    assert a["plotMedianNdvi"] == pytest.approx(0.8, abs=0.01)
    assert a["geometry"]["type"] == "Polygon"
    # el punto está dentro del lote y del polígono
    assert load(a["geometry"]).buffer(1e-5).contains(load({"type": "Point", "coordinates": [a["lon"], a["lat"]]}))
    assert load(GEOM["plots"][0]["geometry"]).contains(load({"type": "Point", "coordinates": [a["lon"], a["lat"]]}))


def test_ignora_areas_chicas_y_caidas_leves():
    grid, ndvi, ok = setup()
    r, c = block(grid, 0, 5, 5)  # 0,25 ha: muy chica
    ndvi[r, c] = 0.3
    r2, c2 = block(grid, 1, 20, 20)  # grande pero solo 0,1 por debajo: no llega a 0,15
    ndvi[r2, c2] = 0.7
    assert _find(grid, ndvi, ok) == []


def test_lote_con_poca_data_valida_no_entra_y_ordena_por_tamano():
    grid, ndvi, ok = setup()
    r, c = block(grid, 0, 12, 12)
    ndvi[r, c] = 0.3
    # el lote b queda con < 60 % de píxeles válidos
    from rasterio.features import geometry_mask

    inside_b = geometry_mask([grid.plots[1][1]], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
    cols = np.where(inside_b.any(axis=0))[0]
    ok[:, cols[0] : cols[0] + int(len(cols) * 0.6)] = False
    r2, c2 = block(grid, 1, 20, 20)
    ndvi[r2, c2] = 0.3
    areas = _find(grid, ndvi, ok)
    assert [x["plotId"] for x in areas] == ["a"]


def test_subida_incluye_lotes_sin_areas_para_limpiar_las_viejas():
    grid, ndvi, ok = setup()
    r, c = block(grid, 0, 15, 15)
    ndvi[r, c] = 0.4
    sent = {}

    def handler(req: httpx.Request) -> httpx.Response:
        import json

        b = json.loads(req.content)
        sent[b["plotId"]] = (b["acquiredAt"], len(b["areas"]))
        return httpx.Response(200, json={"written": len(b["areas"])})

    api = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(handler)))
    assert upload_problem_areas(api, grid, ndvi, ok, 1234) == 1
    assert sent == {"a": (1234, 1), "b": (1234, 0)}

    def boom(req):
        return httpx.Response(500)

    bad = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(boom)))
    assert upload_problem_areas(bad, grid, ndvi, ok, 1) == 0  # no frena el resto del job
