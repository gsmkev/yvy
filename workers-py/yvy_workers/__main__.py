"""python -m yvy_workers <job> [--farm <id>]  (PRD §12). Corre en GitHub Actions."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from typing import Any

from .ingest import IngestClient
from .jobs.constants import BACKFILL_DAYS, BASEMAP_DAYS, DAILY_DAYS

log = logging.getLogger("yvy_workers")

JOBS = ["s2_ingest", "s2_basemap", "country_basemap", "chirps_daily", "firms_hotspots", "climatology_build", "risk_report", "lead_report", "weekly_report", "new_farm", "eudr", "s2_history", "burned_area", "cover_change", "power_daily", "spi", "mgmt_zones", "boundaries", "custom_layers", "fertility_maps"]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="yvy_workers")
    p.add_argument("job", choices=JOBS)
    p.add_argument("--farm", help="Procesar solo esta estancia")
    p.add_argument("--days", type=int, default=None, help="s2_ingest: días hacia atrás (10 por defecto); s2_basemap: 90")
    p.add_argument("--backfill", action="store_true", help=f"s2_ingest: historia de {BACKFILL_DAYS} días (estancia nueva)")
    p.add_argument("--from", dest="from_date", help="cover_change: fecha inicial AAAA-MM-DD")
    p.add_argument("--to", dest="to_date", help="cover_change: fecha final AAAA-MM-DD")
    p.add_argument("--only-missing", action="store_true", help="climatology_build/s2_basemap/risk_report: solo estancias sin datos")
    return p


def ingest_days(args: argparse.Namespace) -> int:
    """Ventana de s2_ingest: --days manda; --backfill usa 180 días; si no, la del cron diario."""
    if args.days:
        return args.days
    return BACKFILL_DAYS if args.backfill else DAILY_DAYS


def _run_country_basemap() -> int:
    from .jobs.country import country_basemap

    country_basemap()
    return 0


def _run_boundaries() -> int:  # límites administrativos: no dependen de las estancias ni de la API
    from .jobs.boundaries import boundaries

    log.info("límites publicados: %d niveles", boundaries())
    return 0


# Jobs que no necesitan la API ni las estancias.
STANDALONE = {"country_basemap": _run_country_basemap, "boundaries": _run_boundaries}


def _chirps(api: IngestClient, farms: list[dict[str, Any]], args: argparse.Namespace) -> int:
    from .jobs.chirps import chirps_daily

    chirps_daily(api, farms)
    return 0


def _weekly(api: IngestClient, farms: list[dict[str, Any]], args: argparse.Namespace) -> int:
    from .jobs.weekly import weekly_report

    return weekly_report(api, farms)


def _risk(api: IngestClient, farms: list[dict[str, Any]], args: argparse.Namespace) -> int:
    from .jobs.risk import risk_report

    return risk_report(api, farms)


def _power(api: IngestClient, farms: list[dict[str, Any]], args: argparse.Namespace) -> int:
    from .jobs.power_daily import DEFAULT_DAYS, power_daily

    return power_daily(api, farms, days=args.days or DEFAULT_DAYS)


def _spi(api: IngestClient, farms: list[dict[str, Any]], args: argparse.Namespace) -> int:
    from .jobs.spi import spi_report

    return spi_report(api, farms)


def _firms(api: IngestClient, farms: list[dict[str, Any]], args: argparse.Namespace) -> int:
    from .jobs.firms import firms_hotspots

    firms_hotspots(api, farms)
    return 0


# Jobs que reciben todas las estancias juntas y devuelven la cantidad de fallas.
BATCH = {"chirps_daily": _chirps, "weekly_report": _weekly, "risk_report": _risk, "power_daily": _power, "spi": _spi, "firms_hotspots": _firms}


def _new_farm(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.new_farm import new_farm

    return new_farm(api, f)


def _s2_ingest(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.s2 import s2_ingest

    log.info("%s: %s", f["name"], s2_ingest(api, f, days=ingest_days(args)))
    return 0


def _burned(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.burned import burned_area

    log.info("%s: %d lotes con resultado", f["name"], burned_area(api, f))
    return 0


def _cover(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.cover import cover_change

    n = cover_change(api, f, date.fromisoformat(args.from_date), date.fromisoformat(args.to_date))
    api.analysis_status(f["id"], "cover_change", "done")
    log.info("%s: %d lotes con cambio de cobertura", f["name"], n)
    return 0


def _s2_history(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.s2 import s2_history

    done = s2_history(api, f)
    api.history_status(f["id"], "done")
    log.info("%s: historia %s", f["name"], done)
    return 0


def _s2_basemap(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.s2 import s2_basemap

    s2_basemap(api, f, days=args.days or BASEMAP_DAYS)
    return 0


def _custom_layers(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.custom_layers import custom_layers

    log.info("%s: %d capas propias listas", f["name"], custom_layers(api, f))
    return 0


def _zones(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.zones import management_zones

    log.info("%s: %d lotes con zonas de manejo", f["name"], management_zones(api, f))
    return 0


def _fertility(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.fertility import fertility_maps

    log.info("%s: mapas de fertilidad %s", f["name"], fertility_maps(api, f) or "sin puntos suficientes")
    return 0


def _eudr(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.eudr import eudr_analysis

    log.info("%s: %d lotes", f["name"], eudr_analysis(api, f))
    return 0


def _climatology(api: IngestClient, f: dict[str, Any], args: argparse.Namespace) -> int:
    from .jobs.climatology import climatology_build

    log.info("%s: %d filas", f["name"], climatology_build(api, f))
    return 0


# Jobs por estancia: una que falla no frena a las demás. Devuelven las fallas que cuentan sin lanzar.
PER_FARM = {
    "new_farm": _new_farm,
    "s2_ingest": _s2_ingest,
    "burned_area": _burned,
    "cover_change": _cover,
    "s2_history": _s2_history,
    "s2_basemap": _s2_basemap,
    "custom_layers": _custom_layers,
    "mgmt_zones": _zones,
    "fertility_maps": _fertility,
    "eudr": _eudr,
    "climatology_build": _climatology,
}


def _mark_failed(api: IngestClient, job: str, farm_id: str) -> None:
    """Jobs bajo demanda que dejan estado visible en la app: marcan 'failed'."""
    if job == "s2_history":
        api.history_status(farm_id, "failed")
    elif job == "cover_change":
        api.analysis_status(farm_id, "cover_change", "failed")


def _run_per_farm(api: IngestClient, farms: list[dict[str, Any]], args: argparse.Namespace) -> int:
    failures = 0
    for f in farms:
        try:
            failures += PER_FARM[args.job](api, f, args)
        except Exception:  # una estancia que falla no frena a las demás
            failures += 1
            _mark_failed(api, args.job, f["id"])
            log.exception("falló %s en %s", args.job, f["name"])
    return failures


def _select_farms(api: IngestClient, args: argparse.Namespace) -> list[dict[str, Any]]:
    farms = api.farms()
    if args.farm:
        farms = [f for f in farms if f["id"] == args.farm]
    if args.only_missing:
        key = {"climatology_build": "hasClimatology", "risk_report": "hasRisk"}.get(args.job, "hasBasemap")
        farms = [f for f in farms if not f.get(key)]
    return farms


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.job in ("new_farm", "s2_history", "cover_change") and not args.farm:
        build_parser().error(f"{args.job} necesita --farm <id>")
    if args.job == "cover_change" and not (args.from_date and args.to_date):
        build_parser().error("cover_change necesita --from y --to (AAAA-MM-DD)")

    if args.job in STANDALONE:
        return STANDALONE[args.job]()

    api = IngestClient()
    if args.job == "lead_report":  # V-04: son pedidos de la landing, no de estancias
        from .jobs.leads import lead_report

        return 1 if lead_report(api, api.leads()) else 0
    farms = _select_farms(api, args)
    if args.job == "new_farm" and not farms:
        log.error("estancia %s inexistente", args.farm)
        return 1

    failures = BATCH[args.job](api, farms, args) if args.job in BATCH else _run_per_farm(api, farms, args)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
