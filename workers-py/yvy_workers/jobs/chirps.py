"""CHIRPS v3 diario (UCSB CHC): lluvia por estancia (RF-60). PRD §12 chirps_daily.

- final (rnl): llega con ~5-6 semanas de retraso; reemplaza a la preliminar.
- prelim (sat): llega con ~4 días de retraso.

Los archivos no son COG y el servidor limita conexiones (HTTP 429), así que cada fecha se baja entera
una sola vez (~18 MB) y se procesa para todas las estancias. Solo se piden las fechas que faltan.
"""

from __future__ import annotations

import logging
import tempfile
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds

from ..geo import load
from ..ingest import IngestClient

log = logging.getLogger(__name__)

BASE = "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily"
PRELIM_LAG_DAYS = 3
BACKFILL_DAYS = 60


def url(d: date, final: bool) -> str:
    if final:
        return f"{BASE}/final/rnl/{d.year}/chirps-v3.0.rnl.{d:%Y.%m.%d}.tif"
    return f"{BASE}/prelim/sat/{d.year}/chirps-v3.0.prelim.{d:%Y.%m.%d}.tif"


def farm_mean(src: rasterio.io.DatasetReader, farm_geom: dict[str, Any]) -> float | None:
    """Media de lluvia en la estancia (píxeles de 0,05° que la tocan)."""
    g = load(farm_geom)
    minx, miny, maxx, maxy = g.bounds
    pad = 0.05
    win = from_bounds(minx - pad, miny - pad, maxx + pad, maxy + pad, src.transform).round_offsets().round_lengths()
    data = src.read(1, window=win, masked=True)
    inside = geometry_mask([g], out_shape=data.shape, transform=src.window_transform(win), invert=True, all_touched=True)
    vals = data[inside & ~np.ma.getmaskarray(data)]
    vals = vals[vals >= 0]
    return round(float(vals.mean()), 2) if vals.size else None


def download(client: httpx.Client, u: str, dest: Path, tries: int = 4) -> bool:
    for attempt in range(tries):
        try:
            return _download_once(client, u, dest, attempt)
        except (httpx.TransportError, _Retry) as e:
            wait = e.wait if isinstance(e, _Retry) else 15 * (attempt + 1)
            log.warning("CHIRPS %s: %s, reintento en %.0fs", u.rsplit("/", 1)[-1], type(e).__name__, wait)
            time.sleep(wait)
    return False


class _Retry(Exception):
    def __init__(self, wait: float):
        self.wait = wait


def _download_once(client: httpx.Client, u: str, dest: Path, attempt: int) -> bool:
    with client.stream("GET", u) as r:
        if r.status_code == 404:
            return False
        if r.status_code in (429, 503):
            raise _Retry(float(r.headers.get("retry-after", 30 * (attempt + 1))))
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
        return True


def missing_dates(latest: dict[tuple[str, str], str], farm_ids: list[str], source: str, start: date, end: date) -> dict[date, list[str]]:
    """Fecha → estancias que necesitan esa fecha de esa fuente."""
    need: dict[date, list[str]] = {}
    for fid in farm_ids:
        last = latest.get((fid, source))
        d = max(start, date.fromisoformat(last) + timedelta(days=1)) if last else start
        while d <= end:
            need.setdefault(d, []).append(fid)
            d += timedelta(days=1)
    return need


def process(client: httpx.Client, d: date, final: bool, farms: list[tuple[str, dict[str, Any]]]) -> list[dict[str, Any]] | None:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "chirps.tif"
        if not download(client, url(d, final), path):
            return None
        rows = []
        with rasterio.open(path) as src:
            for farm_id, geom in farms:
                mm = farm_mean(src, geom)
                if mm is not None:
                    rows.append({"farmId": farm_id, "plotId": "", "date": d.isoformat(), "source": "chirps" if final else "chirps_prelim", "precipMm": mm})
        return rows


def chirps_daily(api: IngestClient, farms: list[dict[str, Any]], today: date | None = None, client: httpx.Client | None = None, max_files: int = 40) -> int:
    today = today or date.today()
    c = client or httpx.Client(timeout=120, follow_redirects=True)
    geoms = {f["id"]: api.farm_geometry(f["id"])["farm"] for f in farms}
    latest = {(r["farmId"], r["source"]): r["latest"] for r in api.climate_latest()}
    ids = list(geoms)
    start = today - timedelta(days=BACKFILL_DAYS)
    # Preliminares: las más nuevas primero. Finales: desde la última cargada hacia adelante, hasta que no haya más.
    plan = [(d, False, fs) for d, fs in sorted(missing_dates(latest, ids, "chirps_prelim", start, today - timedelta(days=PRELIM_LAG_DAYS)).items(), reverse=True)]
    plan += [(d, True, fs) for d, fs in sorted(missing_dates(latest, ids, "chirps", start, today - timedelta(days=30)).items())]
    written = 0
    for d, final, fids in plan[:max_files]:
        try:
            rows = process(c, d, final, [(fid, geoms[fid]) for fid in fids])
        except httpx.HTTPError as e:
            log.warning("CHIRPS %s: %s; sigo con la próxima corrida", d, e)
            break
        if rows is None:
            if final:
                break  # la final todavía no salió para esta fecha ni las siguientes
            continue
        if rows:
            written += api.climate_daily(rows)
        log.info("chirps %s %s: %d estancias", "final" if final else "prelim", d, len(rows))
    return written
