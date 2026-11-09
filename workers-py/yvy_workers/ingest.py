"""Cliente del endpoint /ingest del Worker (PRD-cloudflare §4.6).

Firma: hex(HMAC-SHA256(INGEST_SECRET, f"{ts}.{METHOD}.{path}.{body}")), lotes de <= 40 filas.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from collections.abc import Iterable, Iterator
from typing import Any

import httpx

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

    def _call(self, method: str, path: str, payload: Any | None = None) -> Any:
        body = "" if payload is None else json.dumps(payload, separators=(",", ":"))
        ts = int(time.time() * 1000)
        headers = {
            "content-type": "application/json",
            "x-yvy-timestamp": str(ts),
            "x-yvy-signature": sign(self.secret, ts, method, path, body),
        }
        res = self.http.request(method, self.base_url + path, content=body or None, headers=headers)
        res.raise_for_status()
        return res.json()

    def farms(self) -> list[dict[str, Any]]:
        return self._call("GET", "/ingest/farms")

    def farm_geometry(self, farm_id: str) -> dict[str, Any]:
        return self._call("GET", f"/ingest/farms/{farm_id}/geometry")

    def scene(self, source: str, item_id: str, acquired_at: int, cloud_pct: float | None) -> str:
        r = self._call("POST", "/ingest/scenes", {"source": source, "itemId": item_id, "acquiredAt": acquired_at, "cloudPct": cloud_pct})
        return r["id"]

    def plot_index_stats(self, rows: Iterable[dict[str, Any]]) -> int:
        return sum(self._call("POST", "/ingest/plot-index-stats", {"rows": b})["written"] for b in chunks(rows))

    def climate_daily(self, rows: Iterable[dict[str, Any]]) -> int:
        return sum(self._call("POST", "/ingest/climate-daily", {"rows": b})["written"] for b in chunks(rows))

    def farm_layer(self, **layer: Any) -> str:
        return self._call("POST", "/ingest/farm-layers", layer)["id"]
