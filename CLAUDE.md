# Yvy

Mapa vivo del campo que funciona sin señal. PRD en docs/PRD.md; docs/PRD-cloudflare.md tiene prioridad (stack 100 % gratis en Cloudflare). Decisiones que se apartan de ambos: docs/adr/.

## Estructura

- apps/mobile Expo 58 + Expo Router + expo-sqlite (mismo esquema que D1, ver scripts/gen-schema.mjs) + MapLibre RN 11
- apps/web Vite + React + TanStack Router/Query + Tailwind 4 + MapLibre GL JS 6 + pmtiles + terra-draw; compila a apps/api/public
- apps/api Cloudflare Worker: Hono + Drizzle (D1) + R2 + Queues + Cron
- packages/shared Esquema Drizzle compartido (D1 y app), esquemas Zod de registros y del protocolo de sync, límites, tokens de marca, i18n es-PY
- packages/sync Motor de sincronización (TS puro, sin React Native)
- packages/geo Utilidades Turf (área, punto en polígono, validación)
- workers-py/ Jobs Python que corren en GitHub Actions (Sentinel-2, CHIRPS, FIRMS) y escriben vía /ingest firmado

## Comandos

- pnpm dev / pnpm test / pnpm lint / pnpm typecheck
- pnpm --filter api dev (wrangler dev con D1 y R2 locales; copiar apps/api/.dev.vars.example a .dev.vars)
- pnpm --filter api db:generate (tras cambiar packages/shared/src/schema.ts) y pnpm --filter api db:migrate:local
- pnpm --filter api seed (organización de prueba; ingreso con dueno@yvy.test, el código sale en la consola)
- cd workers-py && uv run pytest
- pnpm --filter web e2e (Playwright contra `wrangler dev`; E2E_DEV_LOG=<log de wrangler dev>)
- pnpm --filter mobile test (YVY_E2E_API + E2E_DEV_LOG para correr también la prueba contra el Worker real)
- Tras cambiar el esquema: pnpm --filter api db:generate && node apps/mobile/scripts/gen-schema.mjs
- Deploy: docs/DEPLOY.md

## Reglas

- Plan gratis de Cloudflare: 10 ms de CPU por request. Nada de bcrypt/scrypt ni parseo grande en el Worker; lo pesado va a workers-py.
- Máximo ~40 queries por invocación (D1: 50) y ≤ 100 parámetros por consulta (usar chunkForParams). Escrituras con db.batch().
- Toda consulta de una ruta autenticada pasa por ScopedDb (apps/api/src/db/scoped.ts), que aplica organización y lotes asignados. Excepciones con acceso de sistema: /ingest y crons (SystemDb), /auth, /admin (panel interno, solo ADMIN_EMAILS) y el control del plan (auth/plan.ts).
- Permisos según la matriz del PRD §9 (objeto `can` en scoped.ts). Cada cambio de permisos lleva test en apps/api/test.
- Toda escritura a una tabla sincronizable: bumpVersion() primero en el batch y `version: currentVersion` en la fila. El pull pagina por (version, id).
- Geometrías en GeoJSON texto + columnas bbox. Validación completa (kinks) en el cliente con packages/geo; el Worker solo valida forma y calcula área/bbox.
- IDs UUIDv7 del cliente, fechas en epoch ms, borrado lógico con deleted_at.
- Esquemas de registros solo en packages/shared/src/records.ts. Límites solo en packages/shared/src/limits.ts.
- Offline primero: toda escritura local va en una transacción con su mutación en el outbox.
- Fuentes permitidas: Sentinel-2, CHIRPS, NASA POWER, NASA FIRMS, MET Norway (User-Agent "Yvy/1.0 koeti.com.py", coordenadas a 4 decimales, caché 3 h, atribución "Datos de MET Norway"). Prohibido Open-Meteo gratis y mosaicos con licencia no comercial.
- Textos en es-PY con voseo, siempre por i18n (packages/shared/src/i18n).
- Paleta: lino #F1EEE4, surco #1E2419, soja #7A9A3F, trigo #D9A93A, cielo #8DB3C7, alerta #D2462B. Rampa NDVI: #B5562E #D9A93A #C9C46A #7A9A3F #3F6B35. Pendiente = borde punteado trigo; sincronizado = sólido soja.
- Antes de terminar: lint, typecheck y tests del paquete tocado.
