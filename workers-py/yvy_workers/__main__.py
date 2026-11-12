"""python -m yvy_workers <job> [--farm <id>]  (PRD §12). Corre en GitHub Actions."""

from __future__ import annotations

import argparse
import logging
import sys

from .ingest import IngestClient
from .jobs.constants import BACKFILL_DAYS, BASEMAP_DAYS, DAILY_DAYS

JOBS = ["s2_ingest", "s2_basemap", "chirps_daily", "firms_hotspots", "climatology_build", "risk_report", "weekly_report", "new_farm", "eudr", "s2_history", "burned_area", "cover_change", "power_daily", "spi"]


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


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log = logging.getLogger("yvy_workers")

    if args.job in ("new_farm", "s2_history", "cover_change") and not args.farm:
        build_parser().error(f"{args.job} necesita --farm <id>")
    if args.job == "cover_change" and not (args.from_date and args.to_date):
        build_parser().error("cover_change necesita --from y --to (AAAA-MM-DD)")

    api = IngestClient()
    farms = api.farms()
    if args.farm:
        farms = [f for f in farms if f["id"] == args.farm]
    if args.only_missing:
        key = {"climatology_build": "hasClimatology", "risk_report": "hasRisk"}.get(args.job, "hasBasemap")
        farms = [f for f in farms if not f.get(key)]
    failures = 0
    if args.job == "new_farm" and not farms:
        log.error("estancia %s inexistente", args.farm)
        return 1

    if args.job == "chirps_daily":
        from .jobs.chirps import chirps_daily

        chirps_daily(api, farms)
    elif args.job == "weekly_report":
        from .jobs.weekly import weekly_report

        failures += weekly_report(api, farms)
    elif args.job == "risk_report":
        from .jobs.risk import risk_report

        failures += risk_report(api, farms)
    elif args.job == "power_daily":
        from .jobs.power_daily import DEFAULT_DAYS, power_daily

        failures += power_daily(api, farms, days=args.days or DEFAULT_DAYS)
    elif args.job == "spi":
        from .jobs.spi import spi_report

        failures += spi_report(api, farms)
    elif args.job == "firms_hotspots":
        from .jobs.firms import firms_hotspots

        firms_hotspots(api, farms)
    else:
        for f in farms:
            try:
                if args.job == "new_farm":
                    from .jobs.new_farm import new_farm

                    failures += new_farm(api, f)
                elif args.job == "s2_ingest":
                    from .jobs.s2 import s2_ingest

                    log.info("%s: %s", f["name"], s2_ingest(api, f, days=ingest_days(args)))
                elif args.job == "burned_area":
                    from .jobs.burned import burned_area

                    log.info("%s: %d lotes con resultado", f["name"], burned_area(api, f))
                elif args.job == "cover_change":
                    from datetime import date

                    from .jobs.cover import cover_change

                    n = cover_change(api, f, date.fromisoformat(args.from_date), date.fromisoformat(args.to_date))
                    api.analysis_status(f["id"], "cover_change", "done")
                    log.info("%s: %d lotes con cambio de cobertura", f["name"], n)
                elif args.job == "s2_history":
                    from .jobs.s2 import s2_history

                    done = s2_history(api, f)
                    api.history_status(f["id"], "done")
                    log.info("%s: historia %s", f["name"], done)
                elif args.job == "s2_basemap":
                    from .jobs.s2 import s2_basemap

                    s2_basemap(api, f, days=args.days or BASEMAP_DAYS)
                elif args.job == "eudr":
                    from .jobs.eudr import eudr_analysis

                    log.info("%s: %d lotes", f["name"], eudr_analysis(api, f))
                elif args.job == "climatology_build":
                    from .jobs.climatology import climatology_build

                    log.info("%s: %d filas", f["name"], climatology_build(api, f))
            except Exception:  # una estancia que falla no frena a las demás
                failures += 1
                if args.job == "s2_history":
                    api.history_status(f["id"], "failed")
                elif args.job == "cover_change":
                    api.analysis_status(f["id"], "cover_change", "failed")
                log.exception("falló %s en %s", args.job, f["name"])
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
