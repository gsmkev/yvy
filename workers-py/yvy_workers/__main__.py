"""python -m yvy_workers <job> [--farm <id>]  (PRD §12). Corre en GitHub Actions."""

from __future__ import annotations

import argparse
import logging
import sys

from .ingest import IngestClient

JOBS = ["s2_ingest", "s2_basemap", "chirps_daily", "firms_hotspots", "climatology_build"]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="yvy_workers")
    p.add_argument("job", choices=JOBS)
    p.add_argument("--farm", help="Procesar solo esta estancia")
    p.add_argument("--days", type=int, default=None)
    p.add_argument("--only-missing", action="store_true", help="climatology_build/s2_basemap: solo estancias sin datos")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log = logging.getLogger("yvy_workers")

    api = IngestClient()
    farms = api.farms()
    if args.farm:
        farms = [f for f in farms if f["id"] == args.farm]
    if args.only_missing:
        key = "hasClimatology" if args.job == "climatology_build" else "hasBasemap"
        farms = [f for f in farms if not f.get(key)]
    failures = 0

    if args.job == "chirps_daily":
        from .jobs.chirps import chirps_daily

        chirps_daily(api, farms)
    elif args.job == "firms_hotspots":
        from .jobs.firms import firms_hotspots

        firms_hotspots(api, farms)
    else:
        for f in farms:
            try:
                if args.job == "s2_ingest":
                    from .jobs.s2 import s2_ingest

                    log.info("%s: %s", f["name"], s2_ingest(api, f, days=args.days or 10))
                elif args.job == "s2_basemap":
                    from .jobs.s2 import s2_basemap

                    s2_basemap(api, f, days=args.days or 90)
                elif args.job == "climatology_build":
                    from .jobs.climatology import climatology_build

                    log.info("%s: %d filas", f["name"], climatology_build(api, f))
            except Exception:  # una estancia que falla no frena a las demás
                failures += 1
                log.exception("falló %s en %s", args.job, f["name"])
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
