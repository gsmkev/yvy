# Yvy

Referencia del código, generada a partir de los comentarios de cada módulo.

## Paquetes

| Paquete | Qué es |
| --- | --- |
| [`apps/api`](ts/api/index.md) | Worker de Cloudflare: Hono, Drizzle sobre D1, R2, colas y crons. |
| [`apps/web`](ts/web/index.md) | Aplicación web: Vite, React, TanStack Router y MapLibre GL JS. |
| [`apps/mobile`](ts/mobile/index.md) | Aplicación móvil offline: Expo, Expo Router, SQLite y MapLibre. |
| [`packages/shared`](ts/shared/index.md) | Esquema Drizzle, esquemas Zod de registros y de sincronización, límites, marca e i18n. |
| [`packages/sync`](ts/sync/index.md) | Motor de sincronización en TypeScript puro. |
| [`packages/geo`](ts/geo/index.md) | Utilidades geográficas con Turf: área, punto en polígono, validación. |
| [`workers-py`](python/yvy_workers/index.md) | Jobs de Python (Sentinel-2, CHIRPS, NASA POWER, FIRMS) que escriben vía `/ingest` firmado. |

Cada paquete tiene una página por módulo.

## Regenerar

Con Docker, sin instalar nada más:

```sh
pnpm run docs:docker   # construye la imagen y sirve el sitio en http://127.0.0.1:8010
```

Sin Docker hace falta `pnpm install` y [uv](https://docs.astral.sh/uv/):

```sh
pnpm run docs         # genera TypeDoc y construye el sitio con mkdocs --strict
pnpm run docs:serve   # lo mismo, con recarga automática en http://127.0.0.1:8010
```

El puerto del contenedor se cambia con `DOCS_PORT`. La salida queda en `docs-site/site/` y el Markdown de TypeDoc en `docs-site/docs/ts/`; ninguna de las dos se versiona.
