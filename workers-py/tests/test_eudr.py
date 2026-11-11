from datetime import date, datetime, timezone

import httpx
import numpy as np
import pytest
from rasterio.features import geometry_mask

from yvy_workers.ingest import IngestClient
from yvy_workers.jobs.eudr import (
    FOREST_NDMI_MIN,
    FOREST_NDVI_MIN,
    LOSS_NDVI_MAX,
    MAX_COMPOSITE_SCENES,
    STATUS_LOSS,
    STATUS_NO_CHANGE,
    STATUS_NO_DATA,
    analyze_plots,
    classify_change,
    dry_season,
    latest_dry_season_year,
    median_composite,
    thin,
    tree_cover,
)
from yvy_workers.jobs.s2 import make_grid

from test_jobs import GEOM


def world():
    """Compuestos sintéticos: todo el lote es monte en 2020 y hoy sigue igual."""
    grid = make_grid(GEOM)
    shape = (grid.height, grid.width)
    ref = (np.full(shape, 0.8, "float32"), np.full(shape, 0.3, "float32"))
    cur = (np.full(shape, 0.8, "float32"), np.full(shape, 0.3, "float32"))
    return grid, ref, cur


def block(grid, plot_idx, rows, cols):
    inside = geometry_mask([grid.plots[plot_idx][1]], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
    r, c = np.argwhere(inside).min(axis=0)
    return slice(r + 10, r + 10 + rows), slice(c + 10, c + 10 + cols)


def by_plot(rows):
    return {r["plotId"]: r for r in rows}


def test_estacion_seca_y_ultimo_anio_terminado():
    s, e = dry_season(2020)
    assert (s.month, s.day, e.month, e.day) == (6, 1, 9, 30)
    assert e < datetime(2021, 1, 1, tzinfo=timezone.utc)  # todo antes de la fecha de corte
    assert latest_dry_season_year(date(2026, 11, 11)) == 2026
    assert latest_dry_season_year(date(2026, 10, 15)) == 2026
    assert latest_dry_season_year(date(2026, 9, 30)) == 2025
    assert latest_dry_season_year(date(2027, 1, 15)) == 2026


def test_regla_de_cobertura_arborea_con_umbrales():
    ndvi = np.array([FOREST_NDVI_MIN, FOREST_NDVI_MIN - 0.01, 0.9, 0.9, np.nan])
    ndmi = np.array([FOREST_NDMI_MIN, 0.5, FOREST_NDMI_MIN - 0.01, 0.4, 0.4])
    assert tree_cover(ndvi, ndmi).tolist() == [True, False, False, True, False]


def test_sin_cambio_no_marca_perdida():
    grid, ref, cur = world()
    rows = by_plot(analyze_plots(ref, cur, grid))
    a = rows["a"]
    assert a["status"] == STATUS_NO_CHANGE
    assert a["lossHa"] == 0 and a["changes"] == []
    assert a["forestRefHa"] == pytest.approx(a["plotAreaHa"])
    assert a["plotAreaHa"] == pytest.approx(439, rel=0.02)  # 0,02 grados: ~2,2 km x 2 km


def test_perdida_de_bloque_de_2_ha_se_mide_y_se_ubica_en_su_lote():
    grid, ref, cur = world()
    r, c = block(grid, 0, 15, 15)  # 15 x 15 px de 10 m = 2,25 ha
    cur[0][r, c] = 0.2  # el monte de 2020 hoy es suelo
    cur[1][r, c] = -0.05
    rows = by_plot(analyze_plots(ref, cur, grid))
    assert rows["a"]["status"] == STATUS_LOSS
    assert rows["a"]["lossHa"] == pytest.approx(2.25, abs=0.01)
    assert len(rows["a"]["changes"]) == 1
    assert rows["a"]["changes"][0]["geometry"]["type"] == "Polygon"
    assert rows["b"]["status"] == STATUS_NO_CHANGE  # el otro lote no se toca


def test_parche_menor_a_media_hectarea_no_cuenta():
    grid, ref, cur = world()
    r, c = block(grid, 0, 6, 6)  # 36 px = 0,36 ha
    cur[0][r, c] = 0.1
    assert analyze_plots(ref, cur, grid)[0]["status"] == STATUS_NO_CHANGE


def test_lo_que_no_era_monte_en_2020_no_es_perdida():
    grid, ref, cur = world()
    r, c = block(grid, 0, 15, 15)
    ref[0][r, c] = 0.3  # en 2020 ya era pastura o cultivo
    cur[0][r, c] = 0.1
    a = by_plot(analyze_plots(ref, cur, grid))["a"]
    assert a["status"] == STATUS_NO_CHANGE
    assert a["forestRefHa"] == pytest.approx(a["plotAreaHa"] - 2.25, abs=0.02)


def test_caida_leve_o_que_sigue_con_ndvi_alto_no_es_perdida():
    grid, ref, cur = world()
    r, c = block(grid, 0, 15, 15)
    cur[0][r, c] = 0.65  # cayó 0,15 y sigue siendo monte
    assert analyze_plots(ref, cur, grid)[0]["status"] == STATUS_NO_CHANGE
    cur[0][r, c] = LOSS_NDVI_MAX + 0.05  # no cayó lo suficiente respecto de 2020
    ref[0][r, c] = 0.62
    assert analyze_plots(ref, cur, grid)[0]["status"] == STATUS_NO_CHANGE


def test_lote_con_nubes_queda_sin_datos():
    grid, ref, cur = world()
    cur[0][:, : grid.width // 2] = np.nan
    rows = by_plot(analyze_plots(ref, cur, grid))
    assert rows["a"]["status"] == STATUS_NO_DATA
    assert rows["a"]["lossHa"] == 0
    assert rows["b"]["status"] == STATUS_NO_CHANGE


def test_classify_change_exige_dato_valido_en_ambos():
    v = np.array([0.8, np.nan, 0.8])
    m = np.array([0.3, 0.3, 0.3])
    valid, forest, lost = classify_change(v, m, np.array([0.1, 0.1, np.nan]), m)
    assert valid.tolist() == [True, False, False]
    assert forest.tolist() == [True, False, False]
    assert lost.tolist() == [True, False, False]


def test_mediana_ignora_nubes_y_pide_observaciones_minimas():
    nan = np.nan
    ndvi, ndmi = median_composite(
        [np.array([0.7, nan, 0.2]), np.array([0.8, 0.5, nan]), np.array([0.9, nan, nan]), np.array([0.1, nan, 0.4])],
        [np.array([0.2, nan, 0.0])] * 4,
    )
    assert ndvi[0] == pytest.approx(0.75)  # mediana de 0,1 0,7 0,8 0,9
    assert np.isnan(ndvi[1])  # una sola observación
    assert ndvi[2] == pytest.approx(0.3)


def test_thin_reparte_las_escenas():
    items = [{"i": i} for i in range(100)]
    out = thin(items)
    assert len(out) == MAX_COMPOSITE_SCENES
    assert out[0]["i"] == 0 and out[-1]["i"] == 99
    assert thin(items[:5]) == items[:5]


def test_el_cliente_firma_y_manda_el_resultado():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append((req.method, req.url.path, req.content))
        return httpx.Response(200, json={"ok": True})

    api = IngestClient("http://x", "secret", httpx.Client(transport=httpx.MockTransport(handler)))
    api.eudr_result({"plotId": "a", "status": "no_change"})
    assert seen[0][:2] == ("POST", "/ingest/eudr")
