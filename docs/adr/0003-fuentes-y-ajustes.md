# ADR 0003 · Fuentes de datos y ajustes encontrados al probar con datos reales

Fecha: 2026-11-09 · Estado: aceptado

| Tema | Decisión | Por qué |
|---|---|---|
| CHIRPS | v3.0 (`products/CHIRPS/v3.0/daily`): `prelim/sat` (~4 días de retraso) y `final/rnl` (~6 semanas) | La v2.0 del PRD ya no está en esa ruta. Los archivos no son COG y el servidor responde 429 si se lee por rangos: se baja cada fecha entera una sola vez y solo las que faltan. |
| Climatología | NASA POWER diario 1991-2020 (`PRECTOTCORR`, `GWETTOP`, `GWETROOT`, `T2M_MIN`), percentiles por día del año con ventana de ±15 días | Una request por estancia. Hacerlo con CHIRPS exigiría ~11.000 archivos. La lluvia de 30 días se compara con la normal de POWER. |
| Humedad del suelo | `GWETTOP`/`GWETROOT` (fracción de saturación 0-1, ~50 km) en `soil_moisture_0_7`/`7_28` | Anexo Cloudflare §4.7. Suficiente para la regla de sequía por estancia, no por lote. |
| Sentinel-2 | Earth Search v1; mosaico por pasada (fecha + satélite) | Una estancia puede caer en 3-4 teselas MGRS: con cada tesela por separado ningún lote pasaba el 60 % válido. |
| Reflectancia | No restar el offset de `raster:bands` cuando `earthsearch:boa_offset_applied` es verdadero | Earth Search ya armoniza los COG; restarlo dos veces daba rojo negativo y NDVI inválido. |
| Mapa base | Mediana de hasta 12 escenas de 90 días, máscara de nubes agrandada 4 px y relleno con la mediana sin máscara | Sin huecos negros; ~1 MB cada 4.400 ha (z10-16), muy por debajo de los 60 MB de RF-44. |
| Pronóstico | MET Norway `complete` (no `compact`) | Trae mínimas de 6 h; las instantáneas cada 6 h no agarran la mínima del amanecer y subestimaban las heladas. |
| MapLibre GL JS 6 | El worker se sirve desde `/maplibre/` y se registra con `setWorkerUrl` | Vite no empaqueta el worker módulo de MapLibre 6. |
| MapLibre Native 13.6 | PMTiles locales con `pmtiles://file://…` | Mismo archivo en web y app (resuelve el spike 1 de la Fase 0 sin MBTiles). Falta verificar en un Android real. |
