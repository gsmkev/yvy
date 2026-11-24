# Yvy

Referencia del código, generada a partir de los comentarios de cada módulo.

## Paquetes

| Paquete | Qué es |
| --- | --- |
| `apps/api` | Worker de Cloudflare: Hono, Drizzle sobre D1, R2, colas y crons. |
| `apps/web` | Aplicación web: Vite, React, TanStack Router y MapLibre GL JS. |
| `apps/mobile` | Aplicación móvil offline: Expo, Expo Router, SQLite y MapLibre. |
| `packages/shared` | Esquema Drizzle, esquemas Zod de registros y de sincronización, límites, marca e i18n. |
| `packages/sync` | Motor de sincronización en TypeScript puro. |
| `packages/geo` | Utilidades geográficas con Turf: área, punto en polígono, validación. |
| `workers-py` | Jobs de Python (Sentinel-2, CHIRPS, NASA POWER, FIRMS) que escriben vía `/ingest` firmado. |

La referencia de [Python](python/) y la de [TypeScript](ts/) tienen una página por módulo.

## Regenerar

Hace falta `pnpm install` y [uv](https://docs.astral.sh/uv/).

```sh
pnpm docs         # genera TypeDoc y construye el sitio con mkdocs --strict
pnpm docs:serve   # lo mismo, pero sirve el sitio en http://127.0.0.1:8000
```

La salida queda en `docs-site/site/` y el Markdown de TypeDoc en `docs-site/docs/ts/`; ninguna de las dos se versiona.
