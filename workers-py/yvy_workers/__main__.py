"""python -m yvy_workers <job> [--farm <id>]  (PRD §12)."""

from __future__ import annotations

import argparse
import sys

JOBS = ["s2_ingest", "s2_basemap", "chirps_daily", "firms_hotspots", "climatology_build"]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="yvy_workers")
    p.add_argument("job", choices=JOBS)
    p.add_argument("--farm", help="Procesar solo esta estancia")
    args = p.parse_args(argv)
    # Cada job se implementa en su fase (4: Sentinel-2, 5: CHIRPS, 6: FIRMS).
    print(f"[{args.job}] pendiente de implementar (farm={args.farm or 'todas'})", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
