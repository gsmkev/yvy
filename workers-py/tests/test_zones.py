from datetime import date

import numpy as np
from rasterio.transform import from_origin
from shapely.geometry import shape

from yvy_workers.jobs.zones import K, cluster_plot, kmeans, majority_filter, season_years, zone_polygons

H, W = 60, 90  # 600 m x 900 m a 10 m


def synthetic(seasons: int = 3, noise: float = 0.01) -> tuple[np.ndarray, np.ndarray]:
    """Tres franjas verticales de vigor bajo, medio y alto que se repiten todos los años (con ruido)."""
    rng = np.random.default_rng(3)
    base = np.zeros((H, W), dtype="float32")
    base[:, :30], base[:, 30:60], base[:, 60:] = 0.45, 0.65, 0.85
    stack = np.stack([base + rng.normal(0, noise, (H, W)).astype("float32") for _ in range(seasons)])
    return stack, np.ones((H, W), dtype=bool)


def test_kmeans_separa_tres_grupos_y_es_deterministico():
    rng = np.random.default_rng(0)
    x = np.concatenate([rng.normal(m, 0.05, (100, 2)) for m in (0.0, 1.0, 2.0)])
    l1, c1 = kmeans(x)
    l2, _ = kmeans(x)
    assert (l1 == l2).all()
    assert sorted(np.round(c1.mean(axis=1)).tolist()) == [0.0, 1.0, 2.0]
    assert len(set(l1[:100])) == 1 and len(set(l1[100:200])) == 1 and len(set(l1[200:])) == 1


def test_tres_zonas_ordenadas_de_menor_a_mayor_vigor():
    stack, inside = synthetic()
    res = cluster_plot(stack, inside)
    assert res is not None
    labels, used = res
    assert used == 3
    assert set(np.unique(labels)) == {1, 2, 3}
    assert (labels[:, 5] == 1).mean() > 0.95  # franja de vigor bajo
    assert (labels[:, 45] == 2).mean() > 0.95
    assert (labels[:, 85] == 3).mean() > 0.95


def test_sin_suficientes_campanas_o_pixeles_no_hay_zonas():
    stack, inside = synthetic(seasons=2)
    stack[1] = np.nan  # una sola campaña con dato
    assert cluster_plot(stack, inside) is None
    stack2, _ = synthetic()
    tiny = np.zeros((H, W), dtype=bool)
    tiny[:5, :5] = True
    assert cluster_plot(stack2, tiny) is None


def test_pixeles_sin_dato_en_una_campana_siguen_contando_con_las_otras():
    stack, inside = synthetic()
    stack[0, :, :20] = np.nan  # nube en la primera campaña
    labels, used = cluster_plot(stack, inside)
    assert used == 3
    assert (labels[:, 5] == 1).mean() > 0.9


def test_filtro_de_mayoria_saca_pixeles_sueltos():
    labels = np.full((20, 20), 2)
    labels[10, 10] = 1
    out = majority_filter(labels, np.ones((20, 20), bool))
    assert out[10, 10] == 2


def test_poligonos_por_zona_con_superficie_y_porcentaje():
    stack, inside = synthetic()
    labels, _ = cluster_plot(stack, inside)
    transform = from_origin(500_000, 7_000_000, 10, 10)
    zones = zone_polygons(labels, np.nanmean(stack, axis=0), transform, "EPSG:32721")
    assert [z["zone"] for z in zones] == [1, 2, 3]
    assert abs(sum(z["pct"] for z in zones) - 100) < 0.5
    assert all(z["areaHa"] > 15 for z in zones)  # 30 columnas x 60 filas x 100 m² = 18 ha
    assert zones[0]["meanNdvi"] < zones[1]["meanNdvi"] < zones[2]["meanNdvi"]
    g = shape(zones[0]["geometry"])
    assert g.geom_type == "MultiPolygon" and g.is_valid
    lon, lat = g.centroid.x, g.centroid.y
    assert -60 < lon < -50 and -30 < lat < -20  # WGS84 (zona UTM 21S)
    assert K == 3


def test_ultimas_estaciones_terminadas():
    assert season_years(date(2026, 11, 11)) == [2023, 2024, 2025]  # la de dic 2025 a mar 2026 ya terminó
    assert season_years(date(2026, 2, 1)) == [2022, 2023, 2024]  # la de 2025/26 todavía no
