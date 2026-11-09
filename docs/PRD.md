# Yvy · PRD del MVP

Versión 1.0 · 9 de noviembre de 2026 · Koeti
Estado: listo para empezar a codificar con Claude Code

> Cómo usar este documento: copialo a la raíz del repo como `docs/PRD.md`, copiá la sección 14 como `CLAUDE.md`, y pedile a Claude Code las fases de la sección 13 de a una ("Implementá la Fase 1 del PRD"). Cada fase tiene criterios de aceptación verificables.

---

## 1. Resumen

Yvy es el mapa vivo de un campo que funciona sin señal. El dueño o administrador dibuja sus lotes y potreros sobre imagen satelital, asigna a cada empleado sus zonas y tareas, y los empleados cargan recorridas, fotos, lluvia, plagas y estado del cultivo o del pasto desde el celular aunque no haya internet. Cuando vuelve la señal, todo se sincroniza. Encima, Yvy cruza cada lote con datos satelitales y climáticos abiertos (vigor, lluvia, temperatura, humedad del suelo) y avisa antes de helada, sequía, exceso de lluvia y fuego.

Promesa central: **el campo no tiene señal, y Yvy funciona igual.**

## 2. Problema

- Gran parte del Chaco y del norte de la Región Oriental no tiene 4G estable. Starlink está en la casa, no en el lote.
- Los partes diarios viven en audios de WhatsApp, fotos sueltas y cuadernos. El dueño se entera tarde o nunca.
- La información climática que existe (DMH) es pobre y no está por lote. Los avisos llegan cuando la helada ya pasó.

## 3. Usuarios

| Rol | Quién es | Qué necesita | Dónde usa Yvy |
|---|---|---|---|
| **Dueño / administrador** | Productor o administrador de 1 a 5 campos | Ver qué pasa en cada lote sin viajar, recibir avisos, reportes para socio o banco | Web (oficina) y app |
| **Agrónomo asesor** | Asesor con 5 a 20 clientes | Ver los campos de sus clientes en un mapa, cargar recorridas | App y web |
| **Empleado de campo** | Capataz, peón, recorredor | Ver solo sus zonas y tareas, cargar rápido sin señal, botones grandes | Solo app Android (gama baja) |

Persona principal del MVP: **estancia mixta o agrícola de 500 a 10.000 ha con 2 a 10 empleados y Starlink en la casa.**

## 4. Objetivos y métricas del MVP

| Objetivo | Métrica | Meta en los primeros 3 meses de piloto |
|---|---|---|
| Que los empleados lo usen | Registros por empleado activo por semana | ≥ 10 |
| Que el offline sea confiable | Registros perdidos o duplicados en la sincronización | 0 |
| Que el dueño lo mire | Dueños que abren la web o la app al menos 2 veces por semana | ≥ 70 % |
| Que los avisos sirvan | Avisos marcados como "útil" por el usuario | ≥ 50 % |
| Revenue | Estancias piloto que pasan a pago después de 60 días | ≥ 5 estancias, ≥ 20.000 ha |

## 5. Alcance

### Dentro del MVP

1. **Cuenta y organización**: una organización con varias estancias, invitación de usuarios con rol.
2. **Mapa de la estancia**: dibujar lotes y potreros sobre imagen satelital; importar KML, KMZ, GeoJSON y shapefile (.zip); superficie calculada en hectáreas; puntos de interés (pluviómetro, aguada/tajamar, casa, tranquera, corral).
3. **Asignación**: cada empleado tiene lotes asignados; solo ve y descarga esos.
4. **Tareas**: tareas simples por lote (recorrer, medir lluvia, revisar aguada), con fecha y repetición diaria o semanal.
5. **Registros offline**: tipos fijos (recorrida, plaga, estado del cultivo, estado del pasto, lluvia, aguada, nota libre), con foto, ubicación GPS y hora. Todo se guarda en el celular y se sube al volver la señal.
6. **Sincronización**: bidireccional, idempotente, con estado visible ("SIN SEÑAL · 3 PENDIENTES" → "SINCRONIZADO · 11:52").
7. **Mapa offline**: imagen satelital de fondo y lotes disponibles sin internet en el área de la estancia.
8. **Satélite**: NDVI por lote desde Sentinel-2 cada ~5 días, con curva de la campaña y comparación contra el promedio del campo.
9. **Clima por lote**: lluvia diaria (CHIRPS) y acumulada a 30 días contra el promedio histórico; temperatura y humedad del suelo (ERA5-Land).
10. **Avisos**: helada, exceso de lluvia, sequía y fuego, con probabilidad o severidad, lotes afectados y anticipación. Por push y email.
11. **Reportes**: parte semanal (PDF) y exportación de registros (Excel) y lotes (KML).
12. **Multi estancia**: vista de todas las estancias de la organización con resumen.

### Fuera del MVP (no construir)

- Facturación automática y pasarela de pago (se factura a mano con factura electrónica SIFEN).
- WhatsApp como canal de avisos y envío de reportes (Fase 2 post MVP; requiere plantillas aprobadas de WhatsApp Business).
- Inventario de insumos, stock de hacienda, costos, contabilidad. **Yvy no es un ERP.**
- Formularios configurables por el usuario.
- Sentinel-1 (humedad bajo nubes), relieve y drenaje (DEM), NASA POWER.
- App iOS para empleados (la app es multiplataforma, pero el piloto se valida en Android).
- Chat interno, IA generativa, recomendaciones agronómicas.
- Portal del agrónomo con múltiples organizaciones (en el MVP el agrónomo es un miembro invitado de cada organización).

## 6. Requisitos funcionales

Prioridad: **P0** imprescindible para el piloto, **P1** deseable en el MVP.

### 6.1 Cuenta, organización y roles

- RF-01 (P0) Registro e ingreso con email y contraseña, y con código de un solo uso por email (magic link). El empleado puede ingresar con número de teléfono + PIN de 6 dígitos creado por el administrador (sin email propio).
- RF-02 (P0) Una organización tiene estancias; un usuario puede pertenecer a varias organizaciones.
- RF-03 (P0) Roles: `owner`, `admin`, `agronomist`, `worker`. Matriz en la sección 9.
- RF-04 (P0) El administrador crea empleados (nombre, teléfono, PIN) y los asigna a lotes.

### 6.2 Mapa y lotes

- RF-10 (P0) Dibujar polígonos sobre imagen satelital en la web, con edición de vértices, y en la app (P1).
- RF-11 (P0) Importar KML, KMZ, GeoJSON y shapefile zipeado. Previsualizar, elegir qué polígonos importar y asignar nombre y tipo.
- RF-12 (P0) Validar geometrías (cerradas, sin autointersección; reparar con `ST_MakeValid`) y calcular superficie en hectáreas con área geodésica.
- RF-13 (P0) Tipo de lote: `crop` (agrícola) o `pasture` (potrero). Para agrícola: cultivo y campaña actual (soja, maíz, trigo, arroz, girasol, chía, otro; zafra o zafriña). Para potrero: tipo de pastura opcional.
- RF-14 (P0) Puntos de interés con tipo y nombre.
- RF-15 (P1) Exportar lotes a KML.

### 6.3 Tareas

- RF-20 (P0) Crear tarea con título, lote (opcional), responsable, fecha y repetición (`none`, `daily`, `weekly`).
- RF-21 (P0) El empleado ve "Hoy" con sus tareas y las marca hechas offline; marcar una tarea abre el registro asociado.
- RF-22 (P1) El administrador ve tareas vencidas por empleado.

### 6.4 Registros (núcleo offline)

- RF-30 (P0) Tipos de registro y campos:

| Tipo | Campos |
|---|---|
| `scouting` (recorrida) | estado general (bueno / regular / malo), nota |
| `pest` (plaga o enfermedad) | plaga de una lista (chinche, oruga, roya, malezas, otra), intensidad (baja/media/alta o número por metro), nota |
| `crop_status` | estadio fenológico (lista corta), estado (bueno/regular/malo), nota |
| `pasture_status` | altura del pasto en cm, cobertura (baja/media/alta), hacienda presente sí/no, nota |
| `rain` | milímetros, pluviómetro (punto de interés), hora de lectura |
| `water` (aguada/tajamar) | nivel (lleno/medio/bajo/seco), nota |
| `note` | texto libre |

- RF-31 (P0) Todo registro guarda: ubicación GPS (si hay fix; si no, el lote elegido), hora del dispositivo, autor, lote (detectado automáticamente si el punto cae dentro de un lote asignado), hasta 5 fotos.
- RF-32 (P0) Las fotos se comprimen en el celular (lado largo 1600 px, JPEG calidad 0,7) y se suben aparte de los datos; el registro se sincroniza aunque las fotos sigan pendientes.
- RF-33 (P0) Un registro sin sincronizar se muestra con borde punteado `trigo`; sincronizado, sólido `soja` (firma visual de la marca).
- RF-34 (P0) El autor puede editar o borrar sus registros durante 24 h.
- RF-35 (P0) En la web: lista y mapa de registros, filtros por estancia, lote, empleado, tipo y fecha; ficha con fotos.

### 6.5 Sincronización y offline

- RF-40 (P0) La app abre, muestra el mapa, los lotes asignados, las tareas y el historial de los últimos 30 días **sin red**.
- RF-41 (P0) Sincronización automática al recuperar red, al abrir la app y cada 15 min en primer plano; botón "Sincronizar ahora".
- RF-42 (P0) Garantías: ningún registro se pierde, ninguno se duplica, aunque se corte la red a mitad de un envío o se reintente 10 veces.
- RF-43 (P0) Indicador de estado siempre visible: `SIN SEÑAL · N PENDIENTES`, `SINCRONIZANDO…`, `SINCRONIZADO · HH:MM`.
- RF-44 (P0) Descarga del paquete offline de la estancia (imagen satelital de fondo + capa NDVI más reciente) por wifi, con tamaño estimado antes de bajar. Meta: ≤ 60 MB para 10.000 ha.
- RF-45 (P1) La app funciona 30 días sin conexión sin degradarse.

### 6.6 Satélite

- RF-50 (P0) Para cada estancia activa, procesar cada escena Sentinel-2 L2A nueva que la cubra: máscara de nubes con SCL, NDVI, estadísticas por lote (media, p10, p90, % de píxeles válidos).
- RF-51 (P0) Descartar del lote la escena si tiene menos de 60 % de píxeles válidos.
- RF-52 (P0) Capa NDVI en teselas con la rampa de vigor de la marca para web y app.
- RF-53 (P0) Ficha del lote: NDVI actual, variación contra el promedio del campo para el mismo cultivo, curva de la campaña.
- RF-54 (P1) Señalar lotes con caída de NDVI > 15 % entre dos escenas válidas en plena campaña.
- RF-55 (P0) Imagen de fondo en color natural: compuesto propio Sentinel-2 de baja nubosidad por estancia (no usar mosaicos de terceros con licencia no comercial).

### 6.7 Clima

- RF-60 (P0) Lluvia diaria por lote desde CHIRPS (preliminar y final), acumulada 7, 30 y 90 días, y anomalía contra la climatología 1991-2020.
- RF-61 (P0) Temperatura mínima y máxima diaria y humedad del suelo (capa 0-7 cm y 7-28 cm) desde ERA5-Land, por centroide de estancia o por lote si es > 2.000 ha.
- RF-62 (P0) Pronóstico a 14 días por estancia desde GFS 0,25° (temperatura mínima, lluvia, viento).
- RF-63 (P0) La lluvia del pluviómetro cargada por el empleado se muestra al lado de la estimada por satélite.

### 6.8 Avisos

- RF-70 (P0) Reglas por defecto (ajustables por organización en P1):

| Aviso | Fuente | Regla inicial | Anticipación |
|---|---|---|---|
| **Helada** | GFS (Tmin 2 m) | Tmin pronosticada ≤ 2 °C en algún día de los próximos 5; probabilidad aproximada por la cantidad de corridas recientes que la confirman (4 corridas por día) y por miembros de GEFS (P1) | hasta 5 días |
| **Exceso de lluvia** | GFS | Lluvia acumulada pronosticada a 72 h ≥ 80 mm, o 7 días ≥ 150 mm | hasta 7 días |
| **Sequía** | CHIRPS + ERA5-Land + GFS | Lluvia 30 días < 50 % de lo normal **y** humedad del suelo bajo el percentil 20 de la climatología, sin lluvia significativa (> 20 mm) en el pronóstico de 10 días | hasta 15 días |
| **Fuego** | NASA FIRMS (VIIRS + MODIS) + GFS viento | Foco de calor a menos de 5 km del perímetro (alto si < 2 km o con viento hacia la estancia > 25 km/h) | casi tiempo real (cada 3 h) |

- RF-71 (P0) Cada aviso lista lotes afectados (para helada, priorizar lotes agrícolas con cultivo sensible activo: trigo, maíz zafriña, girasol, hortalizas).
- RF-72 (P0) Deduplicar: no repetir el mismo aviso para la misma estancia y ventana mientras no cambie la severidad.
- RF-73 (P0) Notificar por push (Expo) y email a `owner`, `admin` y `agronomist`. El empleado recibe solo helada y fuego de sus lotes (P1).
- RF-74 (P0) Siempre mostrar la probabilidad o severidad como orientativa y la fuente. Nunca como certeza.
- RF-75 (P1) Botón "¿Te sirvió?" en cada aviso.

### 6.9 Reportes

- RF-80 (P0) Parte semanal en PDF por estancia: mapa con los registros, tabla de registros (fecha, lote, empleado, observación), hasta 6 fotos, lluvia de la semana, avisos.
- RF-81 (P1) Resumen de campaña por lote en PDF: curva de NDVI contra el promedio, lluvia acumulada, avisos y registros.
- RF-82 (P0) Exportar registros a Excel con filtros.
- RF-83 (P1) Envío automático del parte semanal por email el lunes a las 7:00 (hora de Paraguay).

### 6.10 Multi estancia

- RF-90 (P0) Inicio de la web: mapa de Paraguay con todas las estancias y una línea de resumen por estancia (ha, empleados, avisos activos, último registro).

## 7. Requisitos no funcionales

- **Offline primero**: la app nunca bloquea una acción del empleado esperando la red.
- **Dispositivos**: Android 9+ con 3 GB de RAM; probado en un equipo de gama baja (ej. Samsung A05 o Moto E). Instalación ≤ 40 MB sin el paquete offline.
- **Batería**: GPS solo al crear un registro, no tracking continuo en el MVP.
- **Idioma**: español de Paraguay con voseo. Textos en archivos de i18n desde el día uno (dejar listo para guaraní más adelante).
- **Accesibilidad para el empleado**: botones de al menos 56 px, íconos con texto, flujo de registro en ≤ 4 toques más la foto.
- **Seguridad**: Row Level Security en todas las tablas; un empleado no puede leer lotes ni registros que no le fueron asignados.
- **Privacidad**: los datos de cada organización son suyos; exportación completa disponible. Guardar el mínimo de datos personales (nombre y teléfono del empleado) y revisar con un abogado la normativa paraguaya vigente de datos personales antes del lanzamiento comercial.
- **Atribuciones**: mostrar en la app y la web las atribuciones de Copernicus, CHIRPS, ERA5-Land, NASA FIRMS y NOAA GFS.
- **Costos de infraestructura**: < US$ 150/mes hasta 50 estancias.
- **Observabilidad**: errores de app y web en Sentry; log de cada corrida del pipeline con escenas procesadas y fallas.

## 8. Arquitectura y stack

### 8.1 Vista general

```
┌──────────────────────┐        ┌───────────────────────────────┐
│ App Yvy (Expo / RN)  │  sync  │ Supabase                      │
│ SQLite + outbox      │◄──────►│ Postgres + PostGIS + Auth     │
│ MapLibre offline     │  HTTPS │ Storage (fotos, teselas, PDF) │
└──────────────────────┘        │ Edge Functions (sync, import) │
                                └──────────────┬────────────────┘
┌──────────────────────┐                       │
│ Web Yvy (Vite React) │◄──────────────────────┤
│ MapLibre GL JS       │                       │
└──────────────────────┘        ┌──────────────┴────────────────┐
                                │ Workers Python (cron)         │
                                │ Sentinel-2 · CHIRPS · ERA5    │
                                │ GFS · FIRMS · avisos · PDF    │
                                └───────────────────────────────┘
```

### 8.2 Decisiones de stack

| Capa | Elección | Por qué |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Tipos y validaciones compartidas entre app, web y funciones |
| Lenguaje | TypeScript estricto (app, web, funciones); Python 3.12 (workers geoespaciales) | El ecosistema ráster está en Python |
| App móvil | Expo SDK (última estable) con development build, Expo Router | Android e iOS con un código; OTA updates |
| Base local | `expo-sqlite` + Drizzle ORM | Control total del modelo y de la sincronización; sin dependencia de un servicio de sync pago |
| Mapa móvil | `@maplibre/maplibre-react-native` | Open source, soporta paquetes offline |
| Web | Vite + React + TanStack Router + TanStack Query + Tailwind | Mismo stack que la landing |
| Mapa web | MapLibre GL JS + `terra-draw` para dibujar | Open source, sin costo por carga de mapa |
| Backend | Supabase (Postgres 15+ con PostGIS, Auth, Storage, Edge Functions) | Rápido de arrancar, RLS, ya previsto en la landing |
| Validación | Zod (esquemas compartidos en `packages/shared`) | Una sola definición de cada registro |
| Workers | Python con `pystac-client`, `rasterio`, `rio-tiler`, `xarray`, `rioxarray`, `geopandas`, `exactextract`, `cdsapi`, `herbie-data` | Procesamiento de COG y NetCDF |
| Teselas | PMTiles en Supabase Storage (o Cloudflare R2), servidas como archivo único | Un archivo por estancia y capa; fácil de bajar al celular |
| Ejecución de workers | Contenedor Docker con cron (Fly.io Machines o Railway); en la Fase 0 alcanza con GitHub Actions programado | Barato, sin servidores permanentes |
| PDF | Plantillas HTML renderizadas con Playwright en el worker | Mismo diseño que la marca |
| Push | Expo Notifications | Gratis, Android e iOS |
| Email | Resend | Simple y barato |
| Errores | Sentry | App, web y workers |
| Pruebas | Vitest (TS), Pytest (Python), Maestro (flujos E2E en Android), Playwright (web) | |

### 8.3 Fuentes de datos

| Fuente | Acceso | Uso | Licencia |
|---|---|---|---|
| Sentinel-2 L2A | STAC de Earth Search (AWS Open Data, COG) o Copernicus Data Space Ecosystem | NDVI, fondo color natural | Copernicus, libre con atribución |
| CHIRPS v2.0 diario | Servidor de UCSB CHC (GeoTIFF/NetCDF) | Lluvia diaria y climatología | Dominio público |
| ERA5-Land | Copernicus CDS API (`cdsapi`, requiere cuenta gratuita); retraso ~5 días | Temperatura, humedad del suelo, climatología | Licencia Copernicus, uso comercial permitido con atribución |
| GFS 0,25° | NOAA Open Data en AWS (`herbie-data`) | Pronóstico 14 días | Dominio público |
| NASA FIRMS | API con MAP_KEY gratuita | Focos de calor | Uso libre con atribución |

No usar el plan gratuito de Open-Meteo: no permite uso comercial. Tampoco el mosaico s2cloudless de años con licencia no comercial.

## 9. Roles y permisos

| Acción | owner | admin | agronomist | worker |
|---|---|---|---|---|
| Gestionar organización, miembros y facturación | ✔ | — | — | — |
| Crear/editar estancias, lotes, puntos de interés | ✔ | ✔ | ✔ (si está invitado) | — |
| Asignar lotes y tareas | ✔ | ✔ | ✔ | — |
| Ver todos los lotes y registros de la estancia | ✔ | ✔ | ✔ | Solo sus lotes |
| Crear registros | ✔ | ✔ | ✔ | ✔ (solo en sus lotes o sin lote) |
| Editar/borrar registros | Todos | Todos | Propios | Propios, 24 h |
| Ver satélite, clima y avisos | ✔ | ✔ | ✔ | Solo sus lotes (P1) |
| Reportes y exportaciones | ✔ | ✔ | ✔ | — |

Las reglas viven en políticas RLS de Postgres y se prueban con tests SQL (pgTAP) en la Fase 1.

## 10. Modelo de datos

Convenciones: todas las claves son `uuid` generadas en el cliente (UUIDv7, para que la app pueda crear registros offline). Todas las tablas sincronizables tienen `created_at`, `updated_at` (puesto por el servidor), `deleted_at` (borrado lógico) y `organization_id` para RLS. Geometrías en `geometry(…, 4326)`. Área con `ST_Area(geom::geography) / 10000`.

```sql
-- Identidad y organización
organizations (id, name, country default 'PY', plan, trial_ends_at, created_at, updated_at)
profiles (id → auth.users, full_name, phone, locale default 'es-PY')
memberships (id, organization_id, user_id, role ['owner','admin','agronomist','worker'], status, created_at, updated_at, deleted_at)

-- Campo
farms (id, organization_id, name, department, district, geom MultiPolygon,          -- estancia
       centroid Point, area_ha, timezone default 'America/Asuncion', offline_pack_version,
       created_at, updated_at, deleted_at)
plots (id, organization_id, farm_id, name, kind ['crop','pasture'], geom MultiPolygon, -- lote o potrero
       area_ha, crop, season, sowing_date, pasture_type, color, created_at, updated_at, deleted_at)
points_of_interest (id, organization_id, farm_id, kind ['rain_gauge','water','house','gate','corral','other'],
       name, geom Point, created_at, updated_at, deleted_at)
plot_assignments (id, organization_id, plot_id, user_id, created_at, updated_at, deleted_at)

-- Trabajo
tasks (id, organization_id, farm_id, plot_id null, assignee_id, title, kind, due_date,
       recurrence ['none','daily','weekly'], status ['open','done','cancelled'],
       completed_at, completed_by, record_id null, created_by, created_at, updated_at, deleted_at)
records (id, organization_id, farm_id, plot_id null, poi_id null, author_id,
       kind ['scouting','pest','crop_status','pasture_status','rain','water','note'],
       data jsonb,                 -- validado con el esquema Zod del tipo y schema_version
       schema_version int,
       geom Point null, gps_accuracy_m, captured_at timestamptz,  -- hora del dispositivo
       device_id, created_at, updated_at, deleted_at)
attachments (id, organization_id, record_id, storage_path, mime, width, height, bytes,
       upload_status ['pending','uploaded'], created_at, updated_at, deleted_at)

-- Sincronización
sync_mutations (mutation_id uuid primary key, user_id, device_id, table_name, row_id,
       op ['upsert','delete'], received_at)      -- idempotencia del push
devices (id, user_id, platform, app_version, push_token, last_sync_at)

-- Satélite y clima (escritas solo por workers)
scenes (id, source, item_id, acquired_at, cloud_pct, processed_at)
plot_index_stats (plot_id, scene_id, acquired_at, index ['ndvi'], mean, p10, p90,
       valid_pct, primary key (plot_id, scene_id, index))
farm_layers (id, farm_id, layer ['true_color','ndvi'], acquired_at, pmtiles_path, bytes, bounds)
climate_daily (farm_id, plot_id null, date, source ['chirps','era5land'],
       precip_mm, tmin_c, tmax_c, soil_moisture_0_7, soil_moisture_7_28, primary key (...))
climatology (farm_id, plot_id null, day_of_year, var, p20, p50, p80, mean)  -- 1991-2020
forecasts (farm_id, run_at, source 'gfs', valid_date, tmin_c, tmax_c, precip_mm,
       wind_kmh, wind_dir_deg)
fire_hotspots (id, source, acquired_at, geom Point, confidence, frp)

-- Avisos
alert_rules (id, organization_id, kind, params jsonb, enabled)
alerts (id, organization_id, farm_id, kind ['frost','excess_rain','drought','fire'],
       severity ['info','watch','warning'], probability numeric null,
       valid_from, valid_to, plot_ids uuid[], summary, details jsonb, dedupe_key unique,
       created_at, resolved_at)
alert_feedback (alert_id, user_id, useful boolean, comment)
notifications (id, user_id, alert_id, channel ['push','email'], sent_at, status)

-- Reportes
reports (id, organization_id, farm_id, kind ['weekly','season'], period_start, period_end,
       storage_path, status, created_at)
```

Índices obligatorios: GIST en todas las geometrías; `(organization_id, updated_at)` en cada tabla sincronizable; `(farm_id, captured_at desc)` en `records`.

## 11. Protocolo de sincronización

Patrón: **outbox en el cliente + pull incremental por cursor**. Sin CRDT en el MVP.

**Tablas que bajan al celular** (filtradas por usuario): `farms`, `plots` (solo asignados si es `worker`), `points_of_interest`, `plot_assignments`, `tasks` (las suyas si es `worker`), `records` y `attachments` de los últimos 30 días (de sus lotes si es `worker`), `alerts` activas, `plot_index_stats` del último año (no `worker`).

**Tablas que suben desde el celular**: `records`, `attachments`, `tasks` (solo cambios de estado), `plots` y `points_of_interest` (solo roles no `worker`, P1).

**Push** — `POST /functions/v1/sync/push`
```json
{ "device_id": "…", "mutations": [
  { "mutation_id": "uuidv7", "table": "records", "op": "upsert",
    "row": { "id": "…", "kind": "rain", "data": {"mm": 42}, "captured_at": "…", "…": "…" } }
]}
```
- El servidor procesa en una transacción, en orden. Si `mutation_id` ya existe en `sync_mutations`, la ignora y responde OK (idempotencia).
- Valida con Zod y verifica permisos (la función corre con el JWT del usuario; RLS aplica).
- Conflictos: **última escritura gana por fila** usando `updated_at` del servidor; los registros son casi siempre de un solo autor, así que el conflicto real es raro. Las tareas: `done` gana sobre `open`.
- Respuesta: lista de `mutation_id` aceptadas y rechazadas con motivo. Las rechazadas quedan visibles en la app con un aviso.

**Pull** — `GET /functions/v1/sync/pull?cursor=<opaque>`
- Devuelve las filas con `updated_at > cursor` por tabla (incluye borradas con `deleted_at`), en páginas de 500, y el nuevo cursor.
- El cursor es el máximo `updated_at` del lote más un desempate por `id`, para no perder filas con el mismo timestamp.
- Si cambian las asignaciones de un empleado, el servidor indica `reset: ["plots", …]` y el cliente rehace esas tablas.

**Fotos**: después de un push exitoso del registro, la app sube cada foto a Storage con URL firmada (`organizations/{org}/records/{record}/{attachment}.jpg`) y luego marca `upload_status = 'uploaded'`. Reintento con backoff exponencial; las subidas se hacen solo por wifi si el usuario lo elige.

**Cliente**: cada escritura local va en una transacción SQLite que actualiza la tabla y agrega la mutación al `outbox`. Un `SyncEngine` en `packages/sync` (TS puro, testeable sin React Native) maneja push → pull → fotos, con un solo ciclo a la vez.

**Pruebas obligatorias** del motor (Vitest con un servidor simulado): corte de red a mitad del push, respuesta perdida y reintento, mismo `mutation_id` dos veces, 1.000 registros pendientes, cambio de asignación, reloj del celular atrasado 3 días.

## 12. Pipelines de datos (workers)

Todos en `workers/` (Python), idempotentes, con estado en Postgres, ejecutables a mano con `python -m yvy_workers <job> --farm <id>`.

| Job | Frecuencia | Qué hace |
|---|---|---|
| `s2_ingest` | cada 6 h | Busca en STAC escenas Sentinel-2 L2A nuevas que intersecten estancias activas (nubosidad de escena < 80 %), calcula NDVI con máscara SCL (excluir clases 3, 8, 9, 10, 11), estadísticas por lote con `exactextract`, escribe `plot_index_stats` y regenera el PMTiles NDVI de la estancia (zoom 10 a 16). |
| `s2_basemap` | al crear la estancia y cada 3 meses | Compuesto mediana de color natural de los últimos 90 días con nubosidad baja, PMTiles zoom 10 a 16. |
| `chirps_daily` | diario 10:00 UTC | Descarga CHIRPS preliminar del día disponible (y reemplaza con el final cuando sale), extrae lluvia por lote o estancia. |
| `era5land_daily` | diario | Pide a CDS las variables `2m_temperature` (min/max diaria), `volumetric_soil_water_layer_1/2` para el bbox de Paraguay, extrae por estancia. |
| `climatology_build` | una vez por estancia | Climatología 1991-2020 de CHIRPS y ERA5-Land por día del año (percentiles). Cachear el bbox de Paraguay para no pedir a CDS por cada estancia. |
| `gfs_forecast` | 4 veces por día | Baja GFS 0,25° para el bbox de Paraguay (solo variables necesarias con `herbie`), extrae por estancia, escribe `forecasts`. |
| `firms_hotspots` | cada 3 h | Focos VIIRS y MODIS de las últimas 24 h en Paraguay, buffer de 5 km por estancia. |
| `alerts_evaluate` | después de cada `gfs_forecast`, `firms_hotspots` y `chirps_daily` | Evalúa reglas, crea o actualiza `alerts` por `dedupe_key`, encola notificaciones. |
| `notify` | cada 5 min | Envía push y email pendientes. |
| `reports_weekly` | lunes 10:00 UTC (7:00 PY) | Genera y envía partes semanales. |

## 13. Plan de implementación por fases

Cada fase termina con algo usable y demostrable. Pedile a Claude Code una fase por vez, con este formato: *"Leé docs/PRD.md e implementá la Fase N. Al terminar, verificá cada criterio de aceptación y decime cuáles pasan."*

### Fase 0 · Base del repo y pruebas de riesgo (3-4 días)

- Monorepo con la estructura de la sección 14, pnpm, Turborepo, ESLint, Prettier, TS estricto, CI en GitHub Actions (lint, typecheck, tests).
- Supabase local (`supabase init`), PostGIS activado, primera migración vacía, seed con una organización de prueba.
- `packages/shared`: tokens de marca (paleta de la landing), esquemas Zod de los registros, textos i18n.
- **Spike 1: mapa offline en Expo.** Development build Android con MapLibre RN mostrando un PMTiles local copiado al dispositivo en modo avión. Si PMTiles local no funciona en MapLibre Native, plan B: MBTiles servido por un servidor HTTP local o paquete offline de MapLibre desde URL. Documentar el resultado en `docs/adr/0001-offline-tiles.md`.
- **Spike 2: SQLite + Drizzle en Expo** con una migración y una transacción tabla + outbox.

Aceptación: `pnpm dev` levanta web y Supabase; `pnpm test` pasa en CI; APK de desarrollo muestra un mapa satelital en modo avión; ADR escrito.

### Fase 1 · Web: cuenta, estancias y lotes (1 semana)

- Migraciones de identidad, organización, `farms`, `plots`, `points_of_interest`, `plot_assignments`, con RLS y tests pgTAP de la matriz de permisos.
- Web: registro e ingreso, crear organización, crear estancia, mapa con MapLibre y fondo satelital provisorio (Esri World Imagery solo en desarrollo; en producción, el compuesto propio de la Fase 4), dibujar y editar lotes con `terra-draw`, importar KML/KMZ/GeoJSON/SHP (parseo en el navegador con `@tmcw/togeojson` y `shpjs`, validación y reparación en el servidor), superficie en ha.
- Invitar miembros y crear empleados con teléfono + PIN; asignar lotes.

Aceptación: un dueño crea una estancia, importa un KML con 20 lotes, ve las superficies correctas (± 0,5 % contra QGIS), crea un empleado y le asigna 3 lotes. Un test confirma que ese empleado no puede leer los otros 17.

### Fase 2 · App: registros offline y sincronización (2 semanas)

- App Expo: ingreso (email o teléfono + PIN), selección de estancia, mapa con lotes asignados, pantalla "Cargar" con los 7 tipos de registro (formularios generados desde los esquemas Zod), cámara y compresión, GPS y detección automática del lote.
- `packages/sync`: motor de sincronización con las pruebas de la sección 11.
- Edge Functions `sync/push` y `sync/pull`; subida de fotos con URL firmada.
- Indicador de señal y firma visual punteado → sólido.
- Web: lista y mapa de registros con filtros y ficha con fotos.

Aceptación: en un Android en modo avión se cargan 15 registros con fotos, se cierra y reabre la app, se desactiva el modo avión y en menos de 2 minutos los 15 aparecen en la web, sin duplicados. El flujo E2E en Maestro pasa.

### Fase 3 · Tareas y vista del empleado (1 semana)

- Tareas con repetición; pantalla "Hoy" del empleado; completar tarea abre el registro asociado.
- Web: tablero de tareas por empleado y vencidas.
- Paquete offline de la estancia: descarga por wifi con tamaño estimado y progreso.

Aceptación: el administrador crea "Medir lluvia, todos los días, Ramón"; Ramón la ve offline cada día, la completa cargando lluvia, y el administrador la ve hecha al sincronizar.

### Fase 4 · Satélite (1,5 semanas)

- Workers Python con Docker, `s2_basemap` y `s2_ingest`; PMTiles en Storage; reemplazar el fondo provisorio.
- Ficha del lote: NDVI actual, variación contra el promedio del campo, curva de la campaña (web y app).
- Capa NDVI con la rampa de vigor y leyenda con fuente y fecha.

Aceptación: para una estancia de prueba en Itapúa y una en Boquerón, hay al menos 6 fechas de NDVI de los últimos 60 días, la curva tiene sentido agronómico (sube en soja desde la siembra), y el paquete offline de 10.000 ha pesa ≤ 60 MB.

### Fase 5 · Clima (1 semana)

- `chirps_daily`, `era5land_daily`, `climatology_build`, `gfs_forecast`.
- Capas `LLUVIA`, `TEMPERATURA`, `HUMEDAD DEL SUELO` en el mapa web; lluvia 30 días contra el promedio en la ficha del lote; pluviómetro contra CHIRPS.
- Pronóstico de 14 días por estancia.

Aceptación: la lluvia acumulada de CHIRPS de 30 días para una estancia piloto difiere menos de 30 % de la suma de su pluviómetro (si hay registros); el pronóstico se actualiza 4 veces por día.

### Fase 6 · Avisos (1 semana)

- `firms_hotspots`, `alerts_evaluate`, `notify`; reglas de la sección 6.8; push con Expo y email con Resend.
- Línea de tiempo de 14 días con avisos en la web y lista de avisos en la app.
- Botón "¿Te sirvió?".

Aceptación: backtest con datos de una helada real (por ejemplo, junio o julio de 2026 en Itapúa) dispara el aviso al menos 2 días antes; un foco FIRMS simulado a 3 km del perímetro dispara el aviso de fuego en menos de 5 minutos tras la corrida; no se repiten avisos idénticos.

### Fase 7 · Reportes y multi estancia (1 semana)

- Parte semanal PDF (plantilla HTML con la marca, renderizada con Playwright), Excel de registros, KML de lotes.
- Envío automático del parte por email los lunes.
- Inicio multi estancia con mapa de Paraguay y resumen por estancia.

Aceptación: el PDF de una semana con 40 registros se genera en menos de 30 s y entra en 2 páginas A4; el dueño con 3 estancias las ve todas en el inicio.

### Fase 8 · Piloto (1 semana + acompañamiento)

- Onboarding guiado (crear estancia → importar lotes → crear empleados → bajar app).
- Período de prueba de 60 días por organización, aviso de fin de prueba y bloqueo suave (solo lectura) al vencer.
- Panel interno simple de métricas de la sección 4.
- Sentry, alertas de fallas del pipeline, backups diarios.
- Build de producción en Google Play (prueba interna o cerrada) y web en dominio propio.

Aceptación: 3 estancias reales usando la app durante 2 semanas sin pérdida de datos.

**Total estimado: 10 a 11 semanas de trabajo de una persona con Claude Code.**

## 14. `CLAUDE.md` inicial para el repo

```markdown
# Yvy

Mapa vivo del campo que funciona sin señal. PRD completo en docs/PRD.md.

## Estructura
- apps/mobile   Expo + Expo Router + expo-sqlite + Drizzle + MapLibre RN
- apps/web      Vite + React + TanStack Router/Query + Tailwind + MapLibre GL JS
- packages/shared  Esquemas Zod, tipos, tokens de marca, i18n (es-PY)
- packages/sync    Motor de sincronización (TS puro, sin dependencias de RN)
- supabase/        Migraciones SQL, políticas RLS, tests pgTAP, Edge Functions
- workers/         Jobs Python (Sentinel-2, CHIRPS, ERA5-Land, GFS, FIRMS, avisos, PDF)
- docs/            PRD, ADRs

## Comandos
- pnpm dev / pnpm test / pnpm lint / pnpm typecheck
- supabase start / supabase db reset / supabase test db
- cd workers && uv run pytest

## Reglas
- Offline primero: la app nunca espera a la red para guardar algo del usuario.
- Toda escritura local va en una transacción que también agrega la mutación al outbox.
- IDs UUIDv7 generados en el cliente. Borrado lógico con deleted_at.
- Toda tabla nueva lleva organization_id, updated_at, deleted_at, política RLS y test pgTAP.
- Los esquemas de registros viven solo en packages/shared; app, web y Edge Functions los importan.
- Textos de interfaz en es-PY con voseo, siempre por i18n, nunca hardcodeados.
- Paleta de marca: lino #F1EEE4, surco #1E2419, soja #7A9A3F, trigo #D9A93A, cielo #8DB3C7, alerta #D2462B. Rampa NDVI: #B5562E #D9A93A #C9C46A #7A9A3F #3F6B35.
- Pendiente de sincronizar = borde punteado trigo; sincronizado = sólido soja.
- No usar Open-Meteo gratis ni mosaicos satelitales con licencia no comercial.
- Antes de terminar una tarea: correr lint, typecheck y tests del paquete tocado.
```

## 15. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Teselas offline pesadas o no soportadas en MapLibre RN | Alto | Spike en la Fase 0; limitar zoom máximo a 16; recortar al polígono de la estancia |
| Nubosidad en verano corta la serie de NDVI | Medio | Mostrar huecos honestamente; Sentinel-1 en la versión 2 |
| ERA5-Land llega con ~5 días de retraso | Medio | Usar ERA5-Land para historia y humedad; GFS para lo inmediato |
| Avisos de helada con falsas alarmas | Alto (confianza) | Probabilidad por consistencia de corridas, umbral conservador, botón "¿Te sirvió?" y ajuste por estancia |
| Empleados que no adoptan la app | Alto | Flujo en ≤ 4 toques, ingreso por teléfono + PIN, acompañamiento la primera semana |
| Dispositivos de gama baja con poca memoria | Medio | Probar en un equipo real desde la Fase 2; fotos comprimidas |
| Costos de CDS y procesamiento crecen con estancias | Bajo | Procesar por bbox de Paraguay una sola vez y extraer por estancia |

## 16. Preguntas abiertas

1. Nombre definitivo y dominio (Yvy es provisorio).
2. ¿El piloto arranca con agricultura (Itapúa, Alto Paraná) o con ganadería del Chaco? Cambia qué avisos priorizar (helada vs. fuego y sequía) y si el potrero necesita más campos.
3. ¿Ingreso del empleado solo con teléfono + PIN, o también por código QR que genera el administrador?
4. Precio final: la landing dice US$ 0,80/ha/año en cultivos, US$ 0,30 en ganadería y mínimo de US$ 40/mes. Validar con las primeras 5 estancias.
5. ¿Quién hace el acompañamiento en campo la primera semana del piloto?
