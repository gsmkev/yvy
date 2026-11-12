"""M-16: límites de departamentos (ADM1) y distritos (ADM2) de Paraguay desde geoBoundaries (CC BY 4.0).

Baja la versión simplificada de geoBoundaries, la simplifica más, deja solo el nombre y sube
`boundaries/pry-adm1.geojson` y `boundaries/pry-adm2.geojson` al bucket público de teselas. La web los lee
de ahí; mientras no existan, la capa figura como no disponible. No toca estancias ni la API.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import httpx
from shapely.geometry import mapping, shape

log = logging.getLogger(__name__)

API = "https://www.geoboundaries.org/api/current/gbOpen/PRY/{level}/"
LEVELS = {"adm1": "ADM1", "adm2": "ADM2"}
# grados: ~0,003 ≈ 330 m, de sobra para ver límites sobre el mapa de una estancia
TOLERANCE = {"adm1": 0.004, "adm2": 0.003}
DECIMALS = 4
MAX_TOTAL_BYTES = 1_000_000


def simplify_collection(fc: dict[str, Any], tolerance: float, decimals: int = DECIMALS) -> dict[str, Any]:
    """Polígonos simplificados con coordenadas redondeadas y solo la propiedad `name`. Descarta los que se desvanecen."""
    out: list[dict[str, Any]] = []
    for f in fc.get("features", []):
        props = f.get("properties") or {}
        name = props.get("shapeName") or props.get("name")
        if not name or not f.get("geometry"):
            continue
        geom = shape(f["geometry"]).simplify(tolerance, preserve_topology=True)
        if geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        out.append({"type": "Feature", "properties": {"name": str(name)}, "geometry": _round(mapping(geom), decimals)})
    out.sort(key=lambda x: x["properties"]["name"])
    return {"type": "FeatureCollection", "features": out}


def _round(obj: Any, decimals: int) -> Any:
    if isinstance(obj, (list, tuple)):
        return [_round(x, decimals) for x in obj]
    if isinstance(obj, float):
        return round(obj, decimals)
    if isinstance(obj, dict):
        return {k: _round(v, decimals) for k, v in obj.items()}
    return obj


def dump(fc: dict[str, Any]) -> bytes:
    return json.dumps(fc, ensure_ascii=False, separators=(",", ":")).encode()


def fetch_level(client: httpx.Client, level: str) -> dict[str, Any]:
    meta = client.get(API.format(level=LEVELS[level]), follow_redirects=True)
    meta.raise_for_status()
    url = meta.json()["simplifiedGeometryGeoJSON"]
    res = client.get(url, follow_redirects=True)
    res.raise_for_status()
    return res.json()


def boundaries(client: httpx.Client | None = None, out_dir: Path | None = None, upload: bool = True) -> int:
    """Devuelve la cantidad de niveles publicados. Falla si el total supera 1 MB."""
    from tempfile import TemporaryDirectory

    from ..storage import upload_json

    own = client or httpx.Client(timeout=120, headers={"User-Agent": "Yvy/1.0 koeti.com.py"})
    with TemporaryDirectory() as tmp:
        base = out_dir or Path(tmp)
        files: dict[str, Path] = {}
        total = 0
        for level in LEVELS:
            fc = simplify_collection(fetch_level(own, level), TOLERANCE[level])
            body = dump(fc)
            total += len(body)
            path = base / f"pry-{level}.geojson"
            path.write_bytes(body)
            files[level] = path
            log.info("%s: %d polígonos, %d bytes", level, len(fc["features"]), len(body))
        if total > MAX_TOTAL_BYTES:
            raise RuntimeError(f"límites de {total} bytes: superan {MAX_TOTAL_BYTES}; subí la tolerancia")
        if upload:
            for level, path in files.items():
                upload_json(path, f"boundaries/pry-{level}.geojson")
    return len(files)
