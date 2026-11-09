# Yvy · Variante 100 % gratis sobre Cloudflare

Anexo al PRD (`yvy-prd.md`) · 9 de noviembre de 2026
Límites verificados hoy en la documentación oficial de Cloudflare (enlaces al final).

> Cómo usarlo con Claude Code: copialo al repo como `docs/PRD-cloudflare.md` y empezá el pedido con *"Seguí docs/PRD.md con los cambios de docs/PRD-cloudflare.md, que tienen prioridad"*. Reemplazá el `CLAUDE.md` por el de la sección 9.

---

## 1. Veredicto

**Sí se puede, para el piloto.** Cloudflare gratis cubre la API, la base de datos, la sincronización, las fotos, las teselas del mapa, la web y las tareas programadas livianas. Lo que **no** cubre es el procesamiento satelital: los Workers gratis tienen 10 ms de CPU por ejecución y no corren GDAL ni rasterio, y Containers es solo del plan pago. Ese pedazo va a **GitHub Actions** (también gratis).

Con eso, Yvy corre a costo cero para unas **20 a 30 estancias durante 6 meses**. Lo primero que se llena son las fotos (10 GB de R2) y después la base (500 MB de D1). Para ese momento ya hay clientes pagando y el salto es al plan Workers Paid de **US$ 5/mes**, sin cambiar código.

Tres cosas no son de Cloudflare pero también son gratis: GitHub Actions (procesamiento), Expo Push (notificaciones) y Resend (email, 3.000 por mes).

Únicos gastos que no se pueden evitar del todo:

| Ítem | Costo | Cómo evitarlo en el piloto |
|---|---|---|
| Google Play | US$ 25 una sola vez | Distribuir el APK directo (descarga desde R2) |
| App Store | US$ 99 por año | Piloto solo Android (ya estaba así en el PRD) |
| Dominio propio | ~US$ 10 por año | Usar `*.workers.dev` y `*.r2.dev`; ver nota en 4.5 |

## 2. Límites del plan gratis que mandan el diseño

| Servicio | Límite gratis | Qué implica para Yvy |
|---|---|---|
| Workers | 100.000 requests/día, **10 ms de CPU** por request o cron, 128 MB, 50 subrequests, 5 cron triggers por cuenta | Nada de hashing de contraseñas caro ni parseo pesado; cron solo para tareas cortas |
| Static assets (web) | Gratis, no consumen requests de Workers | La web en Workers con assets estáticos |
| D1 | 5 M filas leídas/día, 100.000 escritas/día, **500 MB por base**, 10 bases, 50 queries por invocación | Índices obligatorios; push de a 40 mutaciones; archivar registros viejos |
| R2 | **10 GB**, 1 M operaciones clase A y 10 M clase B por mes, egress gratis | Fotos muy comprimidas; teselas PMTiles leídas por rangos directo desde R2 |
| Queues | 10.000 operaciones/día | Repartir trabajo de cron por estancia |
| Durable Objects (SQLite) | 100.000 requests/día | No hace falta en el MVP |
| Workflows | 3.000 steps/día, 10 ms de CPU | Opcional para envíos de avisos |
| Browser Rendering | 10 min/día, 3 navegadores | PDF del parte semanal (≈ 10 s cada uno) |
| KV | 1.000 escrituras/día | Solo para caché de pronóstico, no para datos |
| Containers | **No disponible en gratis** | El procesamiento ráster va a GitHub Actions |

## 3. Arquitectura gratis

```
┌──────────────────────────┐   sync    ┌────────────────────────────────┐
│ App Yvy (Expo, Android)  │◄─────────►│ Worker "api" (Hono + Drizzle)  │
│ SQLite + outbox          │   HTTPS   │  D1 (SQLite)  ·  R2 (fotos)    │
│ PMTiles descargado       │           │  Cron: pronóstico, avisos, push│
└────────────┬─────────────┘           └───────────────┬────────────────┘
             │ descarga 1 archivo                       │
             ▼                                          │ ingest firmado
      R2 público (PMTiles, APK)                         │
             ▲                          ┌───────────────┴────────────────┐
             │ range requests           │ GitHub Actions (cron, Python)  │
┌────────────┴─────────────┐            │ Sentinel-2 · CHIRPS · FIRMS    │
│ Web Yvy (static assets)  │            │ escribe stats y PMTiles        │
│ MapLibre + pmtiles       │            └────────────────────────────────┘
└──────────────────────────┘
        Expo Push (gratis) · Resend (3.000 emails/mes gratis)
```

Ventaja extra: D1 es SQLite y la app también usa SQLite, así que **el mismo esquema Drizzle sirve en el servidor y en el celular**.

## 4. Cambios al PRD, pieza por pieza

### 4.1 Supabase → Worker + D1 + R2

| PRD original | Variante gratis |
|---|---|
| Postgres + PostGIS | **D1** (SQLite). Geometrías como GeoJSON en texto + columnas `min_lon, min_lat, max_lon, max_lat` indexadas para filtros por caja |
| `ST_Area`, `ST_MakeValid`, punto en polígono | **Turf.js** en el navegador y en la app (área geodésica, `booleanPointInPolygon`, `kinks` para validar). El Worker solo verifica que el GeoJSON sea válido; no calcula geometría pesada |
| Supabase Auth | Auth propia en el Worker (ver 4.2) |
| RLS de Postgres | Capa de acceso única en el Worker (`scopedDb(user)`) que agrega siempre `organization_id` y, para `worker`, los lotes asignados. Tests con `@cloudflare/vitest-pool-workers` en vez de pgTAP |
| Supabase Storage | **R2**: bucket privado `yvy-media` (fotos, PDF) con URLs firmadas; bucket público `yvy-tiles` (PMTiles, APK) |
| Edge Functions | Rutas del Worker con **Hono** |
| Tipos `uuid`, `jsonb`, `timestamptz`, arrays | `text` (UUIDv7), `text` con JSON, `integer` (epoch ms), tabla puente en vez de `uuid[]` (por ejemplo `alert_plots`) |

Tamaño: una base única de D1 (máx. 500 MB). Un registro con su JSON ocupa ~1 KB, así que entran ~400.000 registros. Al llegar a 400 MB, un cron mueve los registros de más de 12 meses a R2 como NDJSON por estancia (siguen descargables en la exportación).

### 4.2 Autenticación sin gastar CPU

Hashear contraseñas con scrypt o bcrypt pasa los 10 ms de CPU. Solución: **no usar contraseñas.**

- **Dueño, admin y agrónomo:** ingreso con código de 6 dígitos por email (Resend). El código se guarda como SHA-256 (barato), vence a los 10 minutos y tiene 5 intentos.
- **Empleado:** el admin genera en la web un **código QR de vinculación** de un solo uso (vence en 24 h). El empleado lo escanea con la app y queda vinculado al dispositivo. Reemplaza el "teléfono + PIN" del PRD y además es más simple para él.
- **Sesión:** access token JWT HS256 de 1 hora (firmar con HMAC es barato) y refresh token aleatorio de 32 bytes guardado como hash, que dura 90 días y se renueva al sincronizar. Así la app sigue funcionando offline semanas.
- La librería Better Auth soporta D1, pero para mantener el control de la CPU conviene esta implementación chica y propia (~300 líneas).

### 4.3 Sincronización

Mismo protocolo de la sección 11 del PRD, con estos ajustes:

- Push de **a lo sumo 40 mutaciones** por request (límite de 50 queries por invocación); se ejecutan con `db.batch()` en una transacción.
- Pull paginado con índice `(organization_id, updated_at, id)` en cada tabla, para que las filas leídas sean casi iguales a las devueltas (cuenta para los 5 M diarios).
- Sincronización automática cada **30 min** en primer plano (no 15), más al abrir la app y al recuperar señal.
- Validación con Zod de cada mutación. Si un lote grande se acerca al límite de CPU, el cliente baja el tamaño del lote cuando recibe error 1102.
- Fotos: el Worker entrega una URL firmada de subida directa a R2 (el archivo no pasa por el Worker).

### 4.4 Fotos (el primer límite que se llena)

- Comprimir en el celular a **1280 px de lado largo, WebP calidad 0,6 → ~120 KB** (el PRD decía 1600 px JPEG).
- Máximo 3 fotos por registro (el PRD decía 5).
- Con 10 GB entran ~80.000 fotos. A 20 estancias × 15 fotos por día son unos **9 meses**.
- Miniatura de 320 px generada en el celular y subida aparte, para que la web no baje la foto grande en las listas.

### 4.5 Mapa y teselas

- PMTiles por estancia en el bucket público `yvy-tiles`.
- **Web:** MapLibre GL JS con el protocolo `pmtiles` lee rangos directo desde R2. No pasa por el Worker, así que no consume los 100.000 requests diarios; solo operaciones clase B (10 M por mes).
- **App:** descarga el archivo PMTiles completo una vez (una sola operación) y lo lee localmente (mismo spike de la Fase 0).
- Nota sobre dominio: Cloudflare indica que `r2.dev` tiene límite de tráfico y no es para producción. Para el piloto alcanza; cuando haya dominio (~US$ 10/año, el único gasto recomendado) se conecta el bucket al dominio y listo.

### 4.6 Procesamiento satelital y climático → GitHub Actions

Los jobs Python del PRD (sección 12) se ejecutan como **workflows programados de GitHub Actions**. Escriben resultados así: estadísticas al endpoint `POST /ingest` del Worker (firmado con HMAC, lotes de 40 filas) y PMTiles directo a R2 por la API compatible con S3.

| Job | Antes | Ahora | Frecuencia | Min/mes estimados (20 estancias) |
|---|---|---|---|---|
| `s2_ingest` (NDVI) | Worker Python | Actions | diario | ~300 |
| `s2_basemap` | Worker Python | Actions | al crear la estancia y cada 3 meses | ~40 |
| `chirps_daily` | Worker Python | Actions | diario | ~30 |
| `firms_hotspots` | Worker Python | Actions (el CSV de la época de quemas puede tener miles de filas y pasa los 10 ms) | cada 3 h | ~250 |
| `climatology_build` | Worker Python | Actions | una vez por estancia | ~20 |
| **Total** | | | | **~640 de 2.000 gratis** |

Si el repo de workers es **público**, los minutos son ilimitados. El código de procesamiento no tiene nada secreto (las claves van en los secrets de Actions), así que es una opción válida para crecer sin pagar.

Plan B para NDVI: la API Statistical de Sentinel Hub en Copernicus Data Space da 10.000 requests y 10.000 unidades de procesamiento por mes gratis. Alcanzaría para ~20 estancias, pero su página de cuotas no aclara el uso comercial, así que queda solo como respaldo hasta confirmarlo.

### 4.7 Clima y pronóstico → llamadas livianas desde el Worker

| Dato | PRD original | Variante gratis | Dónde corre |
|---|---|---|---|
| Pronóstico | GFS 0,25° con `herbie` (archivos GRIB, 14 días) | **MET Norway Locationforecast 2.0**: JSON por punto, **9 días**, actualiza cada 6 h fuera de los países nórdicos, licencia CC BY 4.0 / NLOD 2.0 (uso comercial permitido con atribución "Datos de MET Norway") | Cron del Worker cada 3 h, una request por estancia, con `User-Agent: Yvy/1.0 koeti.com.py` obligatorio y coordenadas a 4 decimales |
| Temperatura y humedad del suelo diaria | ERA5-Land por CDS (cola lenta, archivos NetCDF) | **NASA POWER** (JSON por punto, gratis, uso comercial libre): `T2M_MIN`, `T2M_MAX`, `GWETTOP`, `GWETROOT`, climatología desde 1981 | Cron del Worker diario |
| Lluvia | CHIRPS | CHIRPS (se mantiene) | GitHub Actions |

Consecuencias en el producto: la línea de tiempo pasa de 14 a **9 días**; la humedad del suelo de NASA POWER es de baja resolución (~50 km), suficiente para la regla de sequía por estancia pero no por lote. ERA5-Land queda para la versión paga.

No usar el plan gratis de Open-Meteo (prohíbe uso comercial).

### 4.8 Avisos y notificaciones

Los 5 cron triggers se reparten así:

| Cron | Frecuencia | Hace |
|---|---|---|
| 1 | cada 3 h | Encola una tarea por estancia en Queues: pedir pronóstico MET Norway y evaluar helada y exceso de lluvia |
| 2 | diario 11:00 UTC | Encola NASA POWER por estancia y evalúa sequía |
| 3 | cada 15 min | Envía notificaciones pendientes (Expo Push y Resend) |
| 4 | lunes 10:00 UTC | Genera partes semanales |
| 5 | diario 03:00 UTC | Mantenimiento: archivado de registros viejos, limpieza de tokens |

- Cada consumidor de Queues procesa **una estancia** por mensaje, así cada ejecución queda muy por debajo de los 10 ms de CPU. 50 estancias × 8 corridas + 50 diarias ≈ 900 operaciones de Queues por día, de 10.000.
- El aviso de fuego lo calcula el job de FIRMS en Actions y lo envía al `/ingest`, que crea la alerta.
- Probabilidad de helada: con MET Norway no hay ensemble; se calcula por consistencia entre corridas sucesivas (se guardan las últimas 4 en D1) y por margen bajo el umbral. Mostrar como "baja / media / alta" en vez de porcentaje exacto.
- Email: Resend gratis = 3.000 por mes y **100 por día**. Alcanza para códigos de ingreso y avisos de ~30 estancias. El canal principal de avisos es push.

### 4.9 Reportes

- **Parte semanal automático:** Browser Rendering (10 min por día). Un PDF tarda ~10 s, así que entran ~50 por día. El cron del lunes genera los PDF de a uno por mensaje de Queue y los reparte entre lunes y martes si hace falta.
- **Bajo demanda en la web:** el PDF se genera **en el navegador** con `@react-pdf/renderer` (costo cero, sin límite).
- Excel y KML: se generan en el navegador (`exceljs`, `tokml`).

### 4.10 Resto

| Necesidad | Gratis |
|---|---|
| Hosting web | Workers static assets |
| Distribución de la app | APK firmado en R2 + enlace en la web; Play Store cuando haya presupuesto |
| Builds de la app | Build local con Gradle (`npx expo run:android --variant release`); EAS solo si alcanza su cuota gratis |
| Errores | Sentry plan Developer (gratis) + Workers Logs |
| Backups | D1 Time Travel (7 días en gratis) + export semanal a R2 desde Actions (`wrangler d1 export`) |
| CI | GitHub Actions |

## 5. Capacidad estimada y qué se llena primero

Supuestos por estancia: 5 empleados, 10 registros por empleado por día, 1,5 fotos por registro, app abierta 8 h por día.

| Recurso | Uso por estancia/día | Límite | Estancias que entran |
|---|---|---|---|
| R2 almacenamiento (fotos) | ~9 MB | 10 GB acumulados | 20 estancias por ~9 meses |
| D1 almacenamiento | ~60 KB | 500 MB acumulados | 20 estancias por >1 año (con archivado, indefinido) |
| D1 filas escritas | ~250 | 100.000/día | ~400 |
| D1 filas leídas | ~15.000 | 5 M/día | ~300 |
| Workers requests | ~600 | 100.000/día | ~150 |
| GitHub Actions (privado) | ~1 min | 2.000 min/mes | ~60 (ilimitado si es público) |
| Resend | ~2 emails | 100/día | ~40 |

**Conclusión:** el techo práctico gratis es **~30 estancias**, y lo marcan las fotos y el email. Con 30 estancias de 3.000 ha a US$ 0,80/ha/año, eso ya son ~US$ 72.000/año de facturación potencial; pasar a Workers Paid (US$ 5/mes) y pagar R2 extra (US$ 0,015/GB/mes) es irrelevante a esa altura.

## 6. Reglas para que el paso a pago no requiera cambios

- Todos los límites (tamaño de lote del push, frecuencia de sync, fotos por registro, calidad de compresión) en `packages/shared/src/limits.ts`.
- Ninguna lógica que dependa de estar en plan gratis; solo valores de configuración.
- Medir uso diario (filas, requests, GB) en una tabla `usage_daily` y mostrarlo en el panel interno, con aviso al 70 % de cada límite.

## 7. Cambios en las fases del PRD

| Fase | Cambio |
|---|---|
| 0 | Reemplazar Supabase por `wrangler` + D1 local + R2 local (Miniflare). Agregar spike 3: medir CPU de un push de 40 mutaciones con validación Zod (`wrangler dev` + `--log-level debug`); debe quedar bajo 5 ms |
| 1 | Auth por código de email y QR de vinculación; geometría con Turf; tests de permisos con `vitest-pool-workers` |
| 2 | Push de 40 mutaciones; fotos WebP 1280 px; sync cada 30 min |
| 4 | Workers Python en GitHub Actions + endpoint `/ingest` firmado |
| 5 | MET Norway (9 días) y NASA POWER en vez de GFS y ERA5-Land; CHIRPS en Actions |
| 6 | Queues por estancia; probabilidad de helada por consistencia de corridas |
| 7 | PDF en el navegador; parte automático con Browser Rendering |
| 8 | Distribución por APK; tabla `usage_daily` y alertas de límite |

## 8. Riesgos de la variante gratis

| Riesgo | Mitigación |
|---|---|
| Un request pasa los 10 ms de CPU (error 1102) | Lotes chicos, nada de criptografía cara, medir en la Fase 0; el cliente reintenta con lote más chico |
| `r2.dev` limitado para producción | Comprar el dominio apenas haya un cliente pagando |
| MET Norway cambia términos o bloquea | Caché en D1; NASA POWER como respaldo para temperatura; plan pago con GFS en un container |
| Se llena R2 antes de lo previsto | Alerta al 70 %; limitar fotos por registro; pasar a pago (centavos por GB) |
| GitHub cambia los minutos gratis | Repo de workers público; procesar solo escenas con < 60 % de nubes |

## 9. `CLAUDE.md` para la variante Cloudflare

```markdown
# Yvy

Mapa vivo del campo que funciona sin señal. PRD en docs/PRD.md; docs/PRD-cloudflare.md tiene prioridad (stack 100 % gratis en Cloudflare).

## Estructura
- apps/mobile     Expo + Expo Router + expo-sqlite + Drizzle + MapLibre RN
- apps/web        Vite + React + TanStack Router/Query + Tailwind + MapLibre GL JS + pmtiles
- apps/api        Cloudflare Worker: Hono + Drizzle (D1) + R2 + Queues + Cron
- packages/shared Esquemas Zod, esquema Drizzle compartido (D1 y app), límites, tokens de marca, i18n es-PY
- packages/sync   Motor de sincronización (TS puro)
- packages/geo    Utilidades Turf (área, punto en polígono, validación)
- workers-py/     Jobs Python que corren en GitHub Actions (Sentinel-2, CHIRPS, FIRMS)

## Comandos
- pnpm dev / pnpm test / pnpm lint / pnpm typecheck
- pnpm --filter api dev (wrangler dev con D1 y R2 locales)
- pnpm --filter api db:migrate:local
- cd workers-py && uv run pytest

## Reglas
- Plan gratis de Cloudflare: 10 ms de CPU por request. Nada de bcrypt/scrypt, nada de parseo grande en el Worker; lo pesado va a workers-py.
- Máximo 40 queries por invocación (límite D1: 50). Usar db.batch().
- Toda consulta pasa por scopedDb(user), que aplica organización y lotes asignados. Nunca consultar D1 directo desde una ruta.
- Geometrías en GeoJSON texto + columnas bbox. Cálculos geométricos con packages/geo en el cliente.
- IDs UUIDv7 del cliente, fechas en epoch ms, borrado lógico con deleted_at.
- Límites configurables solo en packages/shared/src/limits.ts.
- Offline primero: toda escritura local va en una transacción con su mutación en el outbox.
- Fuentes permitidas: Sentinel-2, CHIRPS, NASA POWER, NASA FIRMS, MET Norway (User-Agent "Yvy/1.0 koeti.com.py", coordenadas a 4 decimales, caché 3 h, atribución "Datos de MET Norway"). Prohibido Open-Meteo gratis.
- Textos en es-PY con voseo, siempre por i18n.
- Antes de terminar: lint, typecheck y tests del paquete tocado.
```

## Fuentes

- [Límites de Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Precios de Workers, KV, Containers y Workflows](https://developers.cloudflare.com/workers/platform/pricing/)
- [Límites de D1](https://developers.cloudflare.com/d1/platform/limits/) · [Precios de D1](https://developers.cloudflare.com/d1/platform/pricing/)
- [Precios de R2](https://developers.cloudflare.com/r2/pricing/) · [Precios de Queues](https://developers.cloudflare.com/queues/platform/pricing/) · [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [Browser Rendering](https://developers.cloudflare.com/browser-rendering/pricing/)
- [Cuotas de Copernicus Data Space](https://documentation.dataspace.copernicus.eu/Quotas.html)
- [MET Norway: términos](https://api.met.no/doc/TermsOfService) · [licencia](https://api.met.no/doc/License) · [Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/documentation)
