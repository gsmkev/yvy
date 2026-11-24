"""Pruebas de recorte de agujeros de los polígonos de zonas."""

from shapely.geometry import Polygon

from yvy_workers.jobs.zones import MAX_HOLES, trim_holes


def test_trim_holes_caps_and_drops_small():
    outer = [(0, 0), (10_000, 0), (10_000, 10_000), (0, 10_000)]
    big = [[(x, 100), (x + 200, 100), (x + 200, 300), (x, 300)] for x in range(100, 9_000, 300)]  # 4 ha c/u
    small = [[(x, 5_000), (x + 10, 5_000), (x + 10, 5_010), (x, 5_010)] for x in range(100, 9_000, 300)]
    out = trim_holes(Polygon(outer, big + small))
    assert len(out.interiors) == MAX_HOLES
    assert all(Polygon(r).area >= 5_000 for r in out.interiors)
