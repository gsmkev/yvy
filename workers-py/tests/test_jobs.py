from pathlib import Path

import numpy as np
import pytest
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from yvy_workers.geo import bearing_deg, distance_km, load
from datetime import date

from yvy_workers.jobs.chirps import farm_mean, missing_dates
from yvy_workers.jobs.climatology import doy_table
from yvy_workers.jobs.firms import confident, evaluate_farm, parse_csv
from yvy_workers.jobs.s2 import compute_ndvi, make_grid, plot_stats
from yvy_workers.tiles import ndvi_rgba, write_pmtiles


def square(lon, lat, d):
    return {"type": "Polygon", "coordinates": [[[lon, lat], [lon + d, lat], [lon + d, lat - d], [lon, lat - d], [lon, lat]]]}


FARM = square(-55.95, -27.15, 0.06)
GEOM = {"farm": FARM, "plots": [{"id": "a", "geometry": square(-55.95, -27.15, 0.02)}, {"id": "b", "geometry": square(-55.92, -27.15, 0.02)}]}


def test_ndvi_y_estadisticas_por_lote():
    grid = make_grid(GEOM)
    shape = (grid.height, grid.width)
    red = np.full(shape, 0.05, dtype="float32")
    nir = np.full(shape, 0.45, dtype="float32")  # NDVI = 0.8
    valid = np.ones(shape, bool)
    # Nubes sobre la mitad izquierda: el lote "a" queda con < 60 % válido
    valid[:, : grid.width // 3] = False
    ndvi, ok = compute_ndvi(red, nir, valid)
    stats = {s["plotId"]: s for s in plot_stats(ndvi, ok, grid)}
    assert "a" not in stats  # RF-51
    assert stats["b"]["mean"] == pytest.approx(0.8, abs=1e-3)
    assert stats["b"]["validPct"] >= 99


def test_pmtiles_ndvi(tmp_path: Path):
    grid = make_grid(GEOM)
    ndvi = np.linspace(0, 1, grid.width)[None, :].repeat(grid.height, 0)
    rgba = ndvi_rgba(ndvi, np.ones_like(ndvi, bool))
    assert rgba.shape == (4, grid.height, grid.width) and rgba[3].min() == 255
    size = write_pmtiles(rgba, grid.transform, grid.crs, tmp_path / "x.pmtiles", (-55.96, -27.22, -55.88, -27.14), "t", "a", max_zoom=14)
    assert size > 1000
    from pmtiles.reader import MmapSource, Reader

    with open(tmp_path / "x.pmtiles", "rb") as f:
        r = Reader(MmapSource(f))
        h = r.header()
        assert h["min_zoom"] == 10 and h["max_zoom"] == 14
        assert r.metadata()["attribution"] == "a"


def test_chirps_media_en_la_estancia():
    data = np.zeros((40, 40), dtype="float32")
    data[10:30, 10:30] = 12.0
    profile = {"driver": "GTiff", "height": 40, "width": 40, "count": 1, "dtype": "float32", "crs": "EPSG:4326", "transform": from_origin(-56.5, -26.5, 0.05, 0.05), "nodata": -9999}
    with MemoryFile() as mem:
        with mem.open(**profile) as ds:
            ds.write(data, 1)
        with mem.open() as src:
            assert farm_mean(src, square(-56.0, -27.0, 0.3)) == pytest.approx(12.0)


def test_climatologia_por_dia_del_anio():
    series = {f"{y}{m:02d}15": float(y - 1990) for y in range(1991, 2021) for m in range(1, 13)}
    series["19910101"] = -999
    rows = doy_table(series)
    assert len(rows) == 366
    jan15 = rows[14]
    assert jan15["p50"] == pytest.approx(15.5, abs=1)
    assert rows[100]["mean"] is None or rows[100]["mean"] > 0


CSV = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-27.16,-55.97,330.1,0.4,0.4,2026-08-15,0412,N,VIIRS,n,2.0NRT,290.1,5.2,N
-27.30,-55.90,330.1,0.4,0.4,2026-08-15,0412,N,VIIRS,h,2.0NRT,290.1,8.0,N
-25.00,-57.00,330.1,0.4,0.4,2026-08-15,0412,N,VIIRS,h,2.0NRT,290.1,8.0,N
-27.16,-55.96,330.1,0.4,0.4,2026-08-15,0412,N,VIIRS,l,2.0NRT,290.1,8.0,N
"""


def test_firms_distancias_y_severidad():
    hs = parse_csv(CSV, "VIIRS_SNPP_NRT")
    assert len(hs) == 3  # se descarta la de baja confianza
    assert confident("75") and not confident("10") and not confident("l")
    res = evaluate_farm(FARM, hs)
    assert res is not None
    assert res["severity"] == "warning"  # el foco a ~2 km al oeste está a < 2 km
    assert res["minDistanceKm"] < 2
    assert len(res["hotspots"]) == 1  # el de ~10 km y el de Asunción quedan fuera de los 5 km


def test_geo():
    assert distance_km(load(FARM), -55.92, -27.18) == 0
    assert distance_km(load(FARM), -55.99, -27.18) == pytest.approx(3.96, abs=0.1)
    assert bearing_deg(0, 0, 0, 1) == pytest.approx(0)
    assert bearing_deg(0, 0, 1, 0) == pytest.approx(90)


def test_chirps_solo_fechas_faltantes():
    need = missing_dates({("a", "chirps_prelim"): "2026-11-03"}, ["a", "b"], "chirps_prelim", date(2026, 11, 1), date(2026, 11, 5))
    assert need[date(2026, 11, 4)] == ["a", "b"]
    assert need[date(2026, 11, 2)] == ["b"]
    assert date(2026, 10, 31) not in need


def test_escena_procesada_es_por_estancia(monkeypatch):
    """La misma pasada de Sentinel-2 cubre varias estancias: la marca de procesada no puede ser global."""
    from yvy_workers.jobs import s2

    calls: list[str] = []

    class Api:
        def farm_geometry(self, _fid):
            return {"plots": []}

    item = {"id": "S2A_X", "properties": {"datetime": "2026-11-08T13:50:00Z", "platform": "sentinel-2a", "eo:cloud_cover": 5}}
    monkeypatch.setattr(s2, "search", lambda *a, **k: [item])
    # Sin lotes no hay nada que calcular: solo verificamos la clave con una API que registra las escenas
    class Api2(Api):
        def farm_geometry(self, _fid):
            return {"plots": [["p1", {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}]], "farm": {}}

        def scene(self, _src, item_id, _acq, _cloud):
            calls.append(item_id)
            return {"id": "x", "processed": True}

    monkeypatch.setattr(s2, "make_grid", lambda *_a, **_k: type("G", (), {"farm": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}, "height": 1, "width": 1, "transform": None})())
    monkeypatch.setattr(s2, "geometry_mask", lambda *a, **k: __import__("numpy").ones((1, 1), dtype=bool))
    s2.s2_ingest(Api2(), {"id": "farm-a", "minLon": 0, "minLat": 0, "maxLon": 1, "maxLat": 1}, upload=False)
    s2.s2_ingest(Api2(), {"id": "farm-b", "minLon": 0, "minLat": 0, "maxLon": 1, "maxLat": 1}, upload=False)
    assert calls == ["farm-a:2026-11-08_sentinel-2a", "farm-b:2026-11-08_sentinel-2a"]


def test_ingest_reintenta_errores_de_red(monkeypatch):
    """Cloudflare corta conexiones ociosas: el cliente de ingest reintenta en vez de abortar el job."""
    import httpx

    from yvy_workers.ingest import IngestClient

    n = {"i": 0}

    def handler(request):
        n["i"] += 1
        if n["i"] < 3:
            raise httpx.RemoteProtocolError("Server disconnected without sending a response.", request=request)
        return httpx.Response(200, json={"written": 1})

    monkeypatch.setattr("time.sleep", lambda _s: None)
    api = IngestClient("https://api.test", "secreto", httpx.Client(transport=httpx.MockTransport(handler)))
    assert api._call("POST", "/ingest/climate-daily", {"rows": []}) == {"written": 1}
    assert n["i"] == 3
def test_lote_fino_usa_pixeles_tocados_y_se_marca_poco_confiable():
    """S-11: un lote de ~20 m de ancho no tiene ningún píxel de 10 m con el centro adentro de forma fiable."""
    from yvy_workers.jobs.s2 import is_thin

    thin = {"id": "fino", "geometry": {"type": "Polygon", "coordinates": [[[-55.9500, -27.1500], [-55.9498, -27.1500], [-55.9498, -27.1560], [-55.9500, -27.1560], [-55.9500, -27.1500]]]}}
    geom = {"farm": FARM, "plots": [thin, GEOM["plots"][1]]}
    grid = make_grid(geom)
    assert is_thin(grid.plots[0][1]) and not is_thin(grid.plots[1][1])
    shape = (grid.height, grid.width)
    ndvi, ok = compute_ndvi(np.full(shape, 0.05, "float32"), np.full(shape, 0.45, "float32"), np.ones(shape, bool))
    stats = {s["plotId"]: s for s in plot_stats(ndvi, ok, grid)}
    assert stats["fino"]["lowConfidence"] is True
    assert stats["b"]["lowConfidence"] is False
    assert stats["fino"]["mean"] == pytest.approx(0.8, abs=1e-3)
