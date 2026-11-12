"""Ventanas de tiempo de los jobs (sin dependencias pesadas, para que el CLI las importe sin cargar rasterio)."""

DAILY_DAYS = 10  # s2_ingest diario
BACKFILL_DAYS = 180  # historia de una estancia nueva (S-01)
BASEMAP_DAYS = 90  # compuesto del mapa base
