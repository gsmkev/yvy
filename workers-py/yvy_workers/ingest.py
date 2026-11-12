"""Cliente del endpoint /ingest del Worker (PRD-cloudflare §4.6).

Firma: hex(HMAC-SHA256(INGEST_SECRET, f"{ts}.{METHOD}.{path}.{body}")), lotes de <= 40 filas.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from collections.abc import Iterable, Iterator
from typing import Any

import httpx

log = logging.getLogger("yvy_workers")

MAX_ROWS = 40


def sign(secret: str, ts: int, method: str, path: str, body: str) -> str:
    msg = f"{ts}.{method}.{path}.{body}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def chunks(rows: Iterable[Any], size: int = MAX_ROWS) -> Iterator[list[Any]]:
    batch: list[Any] = []
    for r in rows:
        batch.append(r)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


class IngestClient:
    def __init__(self, base_url: str | None = None, secret: str | None = None, client: httpx.Client | None = None):
        self.base_url = (base_url or os.environ["YVY_API_URL"]).rstrip("/")
        self.secret = secret or os.environ["YVY_INGEST_SECRET"]
        self.http = client or httpx.Client(timeout=60)

    def _call(self, method: str, path: str, payload: Any | None = None, query: dict[str, str] | None = None) -> Any:
        body = "" if payload is None else json.dumps(payload, separators=(",", ":"))
        ts = int(time.time() * 1000)
        headers = {
            "content-type": "application/json",
            "x-yvy-timestamp": str(ts),
            "x-yvy-signature": sign(self.secret, ts, method, path, body),
        }
        # La firma cubre solo la ruta (sin query), igual que el Worker
        res = None
        for attempt in range(4):
            try:
                res = self.http.request(method, self.base_url + path, params=query, content=body or None, headers=headers)
                break
            except httpx.TransportError as e:
                # Cloudflare cierra conexiones que quedaron ociosas mientras el job bajaba archivos: se reintenta
                # (todos los endpoints de /ingest son idempotentes: upsert por clave).
                if attempt == 3:
                    raise
                wait = 2 * (attempt + 1)
                log.warning("ingest %s %s: %s, reintento en %ds", method, path, type(e).__name__, wait)
                time.sleep(wait)
        assert res is not None
        if res.is_error:
            # Incluir la respuesta del Worker (mensaje de validación) para que el log del job diga qué falló
            raise httpx.HTTPStatusError(f"{res.status_code} en {method} {path}: {res.text[:500]}", request=res.request, response=res)
        return res.json()

    def farms(self) -> list[dict[str, Any]]:
        return self._call("GET", "/ingest/farms")

    def farm_geometry(self, farm_id: str) -> dict[str, Any]:
        return self._call("GET", f"/ingest/farms/{farm_id}/geometry")

    def scene(self, source: str, item_id: str, acquired_at: int, cloud_pct: float | None) -> dict[str, Any]:
        """Registra la escena; devuelve {id, processed}."""
        return self._call("POST", "/ingest/scenes", {"source": source, "itemId": item_id, "acquiredAt": acquired_at, "cloudPct": cloud_pct})

    def scene_processed(self, scene_id: str) -> None:
        self._call("POST", f"/ingest/scenes/{scene_id}/processed", {})

    def history_status(self, farm_id: str, status: str) -> None:
        """Estado de la historia de vigor desde 2017 (S-03): done o failed (processing lo pone el Worker al pedirla)."""
        self._call("POST", f"/ingest/farms/{farm_id}/history-status", {"status": status})

    def climate_latest(self) -> list[dict[str, Any]]:
        return self._call("GET", "/ingest/climate-latest")

    def climatology(self, rows: Iterable[dict[str, Any]]) -> int:
        return sum(self._call("POST", "/ingest/climatology", {"rows": b})["written"] for b in chunks(rows))

    def fire_alert(self, **alert: Any) -> dict[str, Any]:
        return self._call("POST", "/ingest/fire-alerts", alert)

    def plot_index_stats(self, rows: Iterable[dict[str, Any]]) -> int:
        return sum(self._call("POST", "/ingest/plot-index-stats", {"rows": b})["written"] for b in chunks(rows))

    def climate_daily(self, rows: Iterable[dict[str, Any]]) -> int:
        return sum(self._call("POST", "/ingest/climate-daily", {"rows": b})["written"] for b in chunks(rows))

    def imagery_status(self, farm_id: str, status: str) -> None:
        """Estado del primer procesamiento: processing o failed (ready lo pone el Worker al llegar el mapa base)."""
        self._call("POST", f"/ingest/farms/{farm_id}/imagery-status", {"status": status})

    def farm_layer(self, **layer: Any) -> str:
        return self._call("POST", "/ingest/farm-layers", layer)["id"]

    def farm_risk(self, farm_id: str, report: dict[str, Any]) -> None:
        """Informe de riesgo climático de la estancia (C-10)."""
        self._call("POST", "/ingest/farm-risk", {"farmId": farm_id, "report": report})

    def problem_areas(self, plot_id: str, acquired_at: int, areas: list[dict[str, Any]]) -> int:
        """Áreas problema de un lote en la última escena (S-08); reemplaza las de escenas anteriores."""
        return self._call("POST", "/ingest/problem-areas", {"plotId": plot_id, "acquiredAt": acquired_at, "areas": areas})["written"]

    def weekly_summary(self, farm_id: str, start: str, end: str) -> dict[str, Any]:
        """Agregados de la semana de una estancia para el parte (R-02)."""
        return self._call("GET", f"/ingest/farms/{farm_id}/weekly-summary", query={"from": start, "to": end})

    def eudr_result(self, result: dict[str, Any]) -> None:
        """Indicador EUDR de un lote (S-30); reemplaza el anterior."""
        self._call("POST", "/ingest/eudr", result)

    def weekly_report(self, farm_id: str, period_start: str, period_end: str, storage_path: str) -> None:
        """Registra el PDF semanal ya subido a R2 (R-02)."""
        self._call("POST", "/ingest/weekly-reports", {"farmId": farm_id, "periodStart": period_start, "periodEnd": period_end, "storagePath": storage_path})
