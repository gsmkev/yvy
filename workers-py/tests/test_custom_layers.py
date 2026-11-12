import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_origin

from yvy_workers.jobs.custom_layers import geotiff_to_png


def write_tif(path, crs="EPSG:4326", count=3, nodata=None, size=40):
    data = (np.arange(size * size).reshape(size, size) % 255).astype("uint8")
    with rasterio.open(
        path, "w", driver="GTiff", height=size, width=size, count=count, dtype="uint8",
        crs=crs, transform=from_origin(-55.9, -27.2, 0.001, 0.001), nodata=nodata,
    ) as dst:
        for b in range(1, count + 1):
            dst.write(data, b)


def test_convierte_a_png_con_las_cuatro_esquinas(tmp_path):
    src, dst = tmp_path / "a.tif", tmp_path / "a.png"
    write_tif(src)
    corners = geotiff_to_png(src, dst)
    assert [round(c, 3) for c in corners[0]] == [-55.9, -27.2]  # arriba-izq.
    assert corners[1][0] > corners[0][0] and corners[1][1] == corners[0][1]  # arriba-der.
    assert corners[3][1] < corners[0][1]  # abajo-izq.
    im = Image.open(dst)
    assert im.mode == "RGBA" and im.size == (40, 40)


def test_una_banda_sale_en_gris_y_se_achica_al_maximo(tmp_path):
    src, dst = tmp_path / "b.tif", tmp_path / "b.png"
    write_tif(src, count=1, size=100)
    geotiff_to_png(src, dst, max_side=50)
    assert Image.open(dst).size == (50, 50)


def test_reproyecta_desde_metros(tmp_path):
    src, dst = tmp_path / "c.tif", tmp_path / "c.png"
    with rasterio.open(
        src, "w", driver="GTiff", height=20, width=20, count=1, dtype="uint8",
        crs="EPSG:32721", transform=from_origin(600000, 7000000, 10, 10),
    ) as d:
        d.write(np.full((20, 20), 100, dtype="uint8"), 1)
    corners = geotiff_to_png(src, dst)
    assert all(-180 <= lon <= 180 and -90 <= lat <= 90 for lon, lat in corners)
    assert -60 < corners[0][0] < -50


def test_sin_georreferencia_falla(tmp_path):
    src = tmp_path / "d.tif"
    with rasterio.open(src, "w", driver="GTiff", height=5, width=5, count=1, dtype="uint8") as d:
        d.write(np.zeros((5, 5), dtype="uint8"), 1)
    try:
        geotiff_to_png(src, tmp_path / "d.png")
    except Exception:
        return
    raise AssertionError("debía fallar")
