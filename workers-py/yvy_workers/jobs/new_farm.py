"""Estancia nueva (M-01, S-01, S-02): mapa base, climatología y 180 días de Sentinel-2 en una sola corrida.

Lo dispara el Worker con workflow_dispatch al crear la estancia. El mapa base va primero: es lo que se ve
enseguida; al subirlo el Worker pasa el estado a `ready`. Cada paso falla por separado.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from ..ingest import IngestClient
from .constants import BACKFILL_DAYS, BASEMAP_DAYS

log = logging.getLogger(__name__)

Step = Callable[[IngestClient, dict[str, Any]], Any]


def _basemap(api: IngestClient, farm: dict[str, Any]) -> Any:
    from .s2 import s2_basemap

    return s2_basemap(api, farm, days=BASEMAP_DAYS)


def _climatology(api: IngestClient, farm: dict[str, Any]) -> Any:
    from .climatology import climatology_build

    return climatology_build(api, farm)


def _backfill(api: IngestClient, farm: dict[str, Any]) -> Any:
    from .s2 import s2_ingest

    return s2_ingest(api, farm, days=BACKFILL_DAYS)


def new_farm(api: IngestClient, farm: dict[str, Any], basemap: Step = _basemap, climatology: Step = _climatology, backfill: Step = _backfill) -> int:
    """Devuelve la cantidad de pasos que fallaron (0 = todo bien)."""
    api.imagery_status(farm["id"], "processing")
    failures = 0
    for name, step in (("mapa base", basemap), ("climatología", climatology), ("historia Sentinel-2", backfill)):
        try:
            log.info("%s: %s -> %s", farm["name"], name, step(api, farm))
        except Exception:
            failures += 1
            log.exception("falló %s en %s", name, farm["name"])
            if step is basemap:
                api.imagery_status(farm["id"], "failed")
    return failures
