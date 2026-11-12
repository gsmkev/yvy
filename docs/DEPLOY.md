# Puesta en producción de Yvy

Todo corre en planes gratis: Cloudflare (Workers, D1, R2, Queues), GitHub Actions, Expo Push y Resend.
Tiempo estimado: 1 hora la primera vez.

## 1. Cuentas que tenés que crear vos

| Cuenta | Para qué | Qué guardar |
|---|---|---|
| Cloudflare (gratis) | API, web, base, fotos, mapas | Account ID y un **API token** con permisos *Workers Scripts, D1, Workers R2 Storage, Queues: Edit* |
| R2 → *Manage API tokens* | URLs firmadas de fotos | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| Resend (gratis, 3.000/mes) | Códigos de ingreso y avisos por email | `RESEND_API_KEY` y un dominio verificado para `EMAIL_FROM` |
| NASA FIRMS (gratis) | Focos de calor | `FIRMS_MAP_KEY` |
| Expo (gratis, opcional) | Notificaciones push | `EAS_PROJECT_ID` (`npx eas init` en `apps/mobile`) |

Sin dominio propio la web queda en `https://yvy-api.<tu-subdominio>.workers.dev` y los mapas en `https://pub-….r2.dev`.
Cloudflare aclara que `r2.dev` tiene límite de tráfico: alcanza para el piloto; con el primer cliente pagando conectá un dominio (~US$ 10/año).

## 2. Infraestructura (una vez)

```bash
export CLOUDFLARE_API_TOKEN=...   CLOUDFLARE_ACCOUNT_ID=...
export R2_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... RESEND_API_KEY=...
APP_ORIGIN=https://yvy-api.<tu-subdominio>.workers.dev ./scripts/setup-cloudflare.sh
```

Crea D1, los buckets `yvy-media` (privado) y `yvy-tiles` (público), CORS, la cola, aplica migraciones,
hace el primer deploy y carga los secrets. Al final imprime `INGEST_SECRET`: guardalo.

## 3. GitHub (Settings → Secrets and variables → Actions)

**Secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `YVY_INGEST_SECRET`,
`FIRMS_MAP_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, y para el APK
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

**Variables:** `DEPLOY_ENABLED=true`, `APP_URL`, `TILES_PUBLIC_URL`, `EMAIL_FROM` (ej. `Yvy <ingreso@tu-dominio>`),
`ADMIN_EMAILS` (quién ve el panel interno), `OPS_EMAIL` (aviso al 70 % de los límites gratis), `YVY_API_URL` (= `APP_URL`),
`ALLOW_SIGNUP` (`true` para el piloto), `EAS_PROJECT_ID` (opcional), `DEMO_ORG_ID` y `DEMO_USER_ID` (demo, ver 5b).

### Parte semanal con PDF adjunto (R-02)

Los lunes 09:00 UTC el job `weekly_report` arma el PDF de cada estancia con dueño o administrador con email y lo sube a
`reports/…` del bucket privado `yvy-media` (el token de R2 de los secrets tiene que alcanzar a ese bucket además de
`yvy-tiles`; otro nombre de bucket va en la variable `R2_MEDIA_BUCKET`). A las 10:00 UTC el cron del Worker manda el email:
si encuentra el PDF de las últimas 72 h, lo adjunta (Resend lo baja desde una URL firmada de R2 que vale 7 días, el Worker no
carga el archivo) y repite el enlace en el texto. Si el job de GitHub se demora o falla, el email sale igual, solo con el
enlace a la página de la web, como antes.

### Secrets del Worker para disparar los jobs al crear una estancia (opcional, S-02)

Sin estos dos el Worker se saltea el disparo (y avisa una vez en el log): la estancia se procesa recién en el cron semanal.

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → *Generate new token*.
   Repository access: **Only select repositories** → solo este repo. Permisos de repositorio: **Actions: Read and write**
   (y nada más; *Metadata: Read* queda por defecto). Vencimiento: 1 año; anotá la fecha para renovarlo.
2. Cargalo en Cloudflare:
   ```bash
   cd apps/api
   echo "github_pat_…" | pnpm wrangler secret put GITHUB_DISPATCH_TOKEN
   echo "<owner>/<repo>" | pnpm wrangler secret put GITHUB_REPO
   ```
   En desarrollo local van en `apps/api/.dev.vars` (ver `.dev.vars.example`).

Al crear una estancia, `POST /org/farms` llama a `POST /repos/{owner}/{repo}/actions/workflows/jobs.yml/dispatches`
(rama `main`) con `job=new_farm` y el id de la estancia. Ese job corre el mapa base, la climatología y 180 días de
Sentinel-2 de esa estancia (~10-20 min de Actions). El estado (`pending`, `processing`, `ready`, `failed`) sale como
`imageryStatus` en `/org/farms` y `/org/farms/:id`; pasa a `ready` cuando llega el mapa base. Si GitHub rechaza el
disparo (token vencido o sin permiso) queda en `failed` y el cron semanal lo recupera. También se puede correr a mano:
Actions → *Jobs de datos* → `new_farm` con el id de la estancia.

Con eso:
- **Deploy** (`deploy.yml`): cada push a `main` corre lint, typecheck y tests, aplica migraciones y publica.
- **Jobs de datos** (`jobs.yml`): Sentinel-2 diario, CHIRPS diario, FIRMS cada 3 h, climatología y mapa base semanal.
  Repo privado: ~640 min/mes de 2.000 gratis para 20 estancias (ilimitado si el repo es público).
- **Backup** (`backup.yml`): export semanal de D1 a R2.
- **Verificación de backup** (`backup-verify.yml`): el día 2 de cada mes baja la última copia de R2, la restaura en una base
  SQLite y comprueba el esquema contra las migraciones y que las tablas clave tengan filas. Si falla, el workflow queda en rojo
  y GitHub avisa por email (ver "Restaurar un backup").

## 4. Clave de firma del APK (guardala: sin ella no hay actualizaciones)

```bash
keytool -genkeypair -v -keystore yvy.keystore -alias yvy -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 yvy.keystore   # → secret ANDROID_KEYSTORE_BASE64
```

Después: Actions → **APK Android** → *Run workflow*. Queda en `https://<APP_URL>/descargar-app`.

## 5. Primera estancia

1. Entrá a la web, registrate y creá la organización.
2. Si configuraste el token de arriba, el mapa base, la climatología y los últimos 6 meses se procesan solos al crear la estancia. Si no, en *Actions → Jobs de datos* corré `new_farm` con el id de la estancia (o esperá al domingo).
3. Creá empleados en **Equipo**, asignales lotes y mostrales el QR de vinculación.
4. El empleado instala el APK, escanea el QR y baja el *Mapa sin conexión* por wifi.

## 5b. Demo pública de solo lectura (opcional)

La landing ofrece "Probar la demo" si el Worker tiene `DEMO_ORG_ID` y `DEMO_USER_ID`. La organización "Estancia de ejemplo"
(plan `demo`, solo lectura, usuario `demo@yvy.invalid`) sale de un SQL generado:

```bash
pnpm --filter api seed:demo            # escribe apps/api/seed/demo.sql e imprime DEMO_ORG_ID y DEMO_USER_ID
```

Para cargarlo en producción, commiteá el `demo.sql` y corré **Actions → Cargar demo → Run workflow** (`demo.yml`), que
lo ejecuta con `wrangler d1 execute --remote` y antes verifica que solo tenga inserciones.

El SQL usa ids fijos e `INSERT OR IGNORE`: correrlo de nuevo no duplica nada. Los registros de los últimos 60 días son
relativos al día en que corriste el script; para refrescarlos, borrá las filas de esa organización y cargá un `demo.sql` nuevo.
Después cargá `DEMO_ORG_ID` y `DEMO_USER_ID` como variables de GitHub (Settings → Variables); `deploy.yml` se las pasa al Worker.

## 6. Monitoreo de errores con Sentry (opcional, P-02)

Sin DSN no se carga el SDK ni sale ningún pedido de red. Con DSN se informan errores inesperados (500 del Worker, crons y cola;
errores de JavaScript en la web y la app). No viajan encabezados, cookies, cuerpos ni usuarios.

1. En Sentry (plan gratis) creá tres proyectos: uno de tipo Cloudflare/Node (Worker), uno React (web) y uno React Native (app).
2. En GitHub → Settings → Variables (no son secretos: el DSN es público por diseño):
   - `SENTRY_DSN_API`: DSN del Worker. El deploy lo pasa como variable `SENTRY_DSN`. En desarrollo va en `apps/api/.dev.vars`.
   - `SENTRY_DSN_WEB`: DSN de la web. Se compila dentro del build como `VITE_SENTRY_DSN`.
   - `SENTRY_DSN_APP`: DSN de la app. Se compila dentro del APK como `EXPO_PUBLIC_SENTRY_DSN`.
3. Vacías o sin definir, el monitoreo queda apagado. Para probar: poné el DSN, provocá un error y buscalo en Sentry.

Límite: el plan gratis de Sentry tiene cupo mensual de eventos; si se agota deja de recibir hasta el mes siguiente.

## 7. Pasar a pago (cuando haga falta)

Todos los límites están en `packages/shared/src/limits.ts`. Workers Paid (US$ 5/mes) quita el techo de CPU y de requests;
R2 cobra US$ 0,015/GB/mes después de 10 GB. No hace falta cambiar código.

**Topes por plan (P-10).** `LIMITS.plans` fija hectáreas de estancias y personas con acceso por plan (prueba: 100.000 ha y 25 personas).
La API responde 402 con un mensaje claro al crear estancias, lotes o personas por encima del tope. Desde el panel interno
(`/interno`, solo `ADMIN_EMAILS`) → *Plan y topes* se cambia el plan y se fijan topes propios de una organización (vacío = el del plan).
El mismo panel permite extender la prueba 30 días y "Ver como soporte" (solo lectura, 30 minutos, queda en la auditoría).

## 8. Restaurar un backup (P-05)

Las copias están en R2: `yvy-media/backups/yvy-AAAA-MM-DD.sql.gz` (una por semana). D1 Time Travel cubre además los últimos 7 días.

**Probar que una copia sirve (en tu máquina, sin tocar producción):**

```bash
# con CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID exportados
pnpm --filter api backup:restore -- --latest --db /tmp/yvy-restaurada.sqlite
# o con un archivo que ya bajaste:
pnpm --filter api backup:restore -- yvy-2026-11-08.sql.gz --db /tmp/yvy-restaurada.sqlite --min-rows farms=1
```

Imprime las filas de cada tabla y sale con error si falta una tabla o columna respecto de `apps/api/migrations`, si
`organizations`, `users` o `memberships` están vacías, o si no llega a un `--min-rows tabla=n`. Después abrí la base con
`sqlite3 /tmp/yvy-restaurada.sqlite` para mirar los datos. Necesita Node 22 (usa `node:sqlite`).

**Cargarla en el D1 local** para trabajar con datos reales: descomprimí (`gunzip -k yvy-….sql.gz`) y corré
`pnpm --filter api exec wrangler d1 execute yvy --local --file yvy-….sql` (borrá antes `apps/api/.wrangler/state` si ya había datos).

**Recuperar producción** (solo ante un desastre): creá una base nueva (`wrangler d1 create yvy-restore`), cargala con
`wrangler d1 execute yvy-restore --remote --file yvy-….sql`, comprobala con el script de arriba y recién ahí cambiá el
`database_id` (secret `D1_DATABASE_ID`) y volvé a desplegar. No sobrescribas la base vieja hasta confirmar que la nueva está bien.

## 9. Prueba de carga del sync (P-21)

Simula 10 empleados mandando en paralelo 1.000 registros con fotos (solo los metadatos, no los archivos) contra un
`wrangler dev`, y mide tiempo por push, rendimiento y fallas. Sirve para ver si un cambio en el sync o en las consultas
empeora algo antes de publicarlo. **Mide el Worker local (workerd + D1 local), no producción**: no mide los 10 ms de CPU
del plan gratis ni la latencia real de D1; para eso mirá la pestaña Metrics del Worker en el panel de Cloudflare.

```bash
cd apps/api
cp .dev.vars.example .dev.vars          # una sola vez
pnpm db:migrate:local
pnpm dev > /tmp/dev.log 2>&1 &          # esperar "Ready on http://localhost:8787"
pnpm load:sync -- --log /tmp/dev.log    # opciones: --workers 10 --records 1000 --photos 2 --api http://localhost:8787
```

El script crea su propia organización (el código de ingreso lo lee del log de `wrangler dev`, igual que los E2E), una estancia con un
lote por empleado y los empleados vinculados. Cada empleado manda sus registros en pushes de hasta 40 mutaciones
(`LIMITS.sync.maxMutationsPerPush`). Al final comprueba contra el servidor que llegó cada registro y cada foto una sola vez y que
repetir un push no duplica nada. Sale con código 1 si hubo fallas (HTTP o mutaciones rechazadas) o no cuadran los conteos.
Con `--photos 0` se mide solo el costo de los registros; `--records 5000` para estresar más.

Referencia (máquina de desarrollo, local, 10 empleados, 1.000 registros, 2 fotos): 80 pushes, mediana 190 ms, p95 261 ms, 0 fallas.
Cada corrida deja datos de prueba en el D1 local; para limpiarlos borrá `apps/api/.wrangler/state`.

Los cálculos del script (reparto, percentiles, armado de lotes, resumen) tienen pruebas en `apps/api/scripts/load-sync.test.mjs`,
que corren con `pnpm --filter api test`.

## Archivado de datos viejos a R2 (opcional, P-06)

D1 gratis guarda 500 MB. Con la variable `ARCHIVE_AFTER_MONTHS` (número entero, mínimo 3; por ejemplo `12`) el cron diario de
mantenimiento (03:00 UTC) mueve, de a una tanda por tabla y por corrida, los **registros** y las **estadísticas de vigor**
más viejos que ese plazo al bucket privado `yvy-media`, en `archive/<tabla>/AAAA-MM/<corrida>-<id>.ndjson` (un archivo por
tanda, una carpeta por mes), y recién después los borra de D1. Con los registros se archivan sus adjuntos (las fotos quedan en R2
donde estaban) y comentarios. No se archivan los tipos que la app y la web leen siempre: hacienda (conteos, movimientos,
mortandad, sanidad), siembra, aplicación, fertilización y cosecha. Sin la variable no se archiva nada.

Cargala como variable del Worker (en `wrangler.jsonc` → `vars`, o en GitHub → Variables y pasarla desde `deploy.yml`);
no es un secreto. En desarrollo va en `apps/api/.dev.vars`.

Restaurar un mes (genera SQL, no toca la base):

```bash
pnpm --filter api exec wrangler r2 object get yvy-media/archive/records/2025-01/<archivo>.ndjson --remote --file reg-2025-01.ndjson
node apps/api/scripts/restore-archive.mjs reg-2025-01.ndjson > restaurar.sql
pnpm --filter api exec wrangler d1 execute yvy --remote --file restaurar.sql
```

Las filas se insertan con `INSERT OR IGNORE` y una versión de sync nueva, así los celulares las vuelven a bajar. Los nombres de los
archivos de un mes se ven en el panel de R2 (Cloudflare → R2 → yvy-media → `archive/`).

## Ingreso con Google (opcional, P-07)

Sin las dos variables no existe `/auth/google` y la web no muestra el botón. Solo entra quien **ya tiene cuenta**: se vincula por el
email que Google verificó (no crea organizaciones; para eso está el registro). No se guarda nada de Google en la base.

1. Google Cloud Console → APIs y servicios → Credenciales → *Crear credenciales* → **ID de cliente de OAuth**, tipo *Aplicación web*
   (pantalla de consentimiento: alcances `openid`, `email`, `profile`).
2. *URI de redireccionamiento autorizados*: `<APP_URL>/auth/google/callback` (ej. `https://yvy-api.<subdominio>.workers.dev/auth/google/callback`;
   en desarrollo `http://localhost:8787/auth/google/callback`).
3. Cargá los datos en el Worker:
   ```bash
   cd apps/api
   echo "<id>.apps.googleusercontent.com" | pnpm wrangler secret put GOOGLE_CLIENT_ID
   echo "<secreto>" | pnpm wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   En desarrollo van en `apps/api/.dev.vars` (ver `.dev.vars.example`). `APP_URL` tiene que ser la dirección pública exacta.

## Actualizar la app sin tienda: EAS Update (opcional, P-31)

El APK se distribuye directo (sección 4), pero el **código JavaScript y los assets** se pueden actualizar sin que nadie reinstale:
la app, al abrirse, busca una actualización y la usa la próxima vez que arranca. Sin la variable `EAS_UPDATE_URL` está apagado y
todo sigue como antes (instalar el APK nuevo).

1. En `apps/mobile`: `npx eas init` (crea el proyecto de Expo, gratis) → te da el `EAS_PROJECT_ID`.
2. GitHub → Settings → Variables: `EAS_PROJECT_ID` y `EAS_UPDATE_URL` = `https://u.expo.dev/<EAS_PROJECT_ID>`; Secrets: `EXPO_TOKEN`
   (Expo → Account settings → Access tokens). El workflow **APK Android** pasa `EAS_UPDATE_URL` al build, así que hay que
   **generar un APK nuevo una vez** con la variable cargada para que ese APK sepa buscar actualizaciones.
3. Para publicar un cambio de JavaScript: Actions → **Actualización de la app (EAS Update)** → *Run workflow* con un mensaje; o
   `EAS_UPDATE_URL=... pnpm --filter mobile run update "qué cambia"` desde tu máquina (con `EXPO_TOKEN`).

Reglas: `runtimeVersion` sigue a `version` de `apps/mobile/app.config.ts`. Una actualización solo llega a APKs de **la misma versión**.
Si el cambio toca código nativo (un plugin o permiso nuevo, una dependencia con módulo nativo), subí `version` y publicá un APK nuevo:
publicar una actualización incompatible con el nativo instalado podría romper la app. En desarrollo (`expo start`) no se usa.
Canales: `production` (APK de producción) y `preview` (pruebas internas), definidos en `apps/mobile/eas.json`.

## Academia: videos en /ayuda (opcional, V-10)

La sección **Videos** de `/ayuda` lista los temas (mapa, registros, sin señal, tareas, avisos, informes, equipo). Sin configurar, cada tema
dice "Próximamente": no hay videos de relleno. Para enlazar los reales, cargá la variable de GitHub (Settings → Variables)
`ACADEMY_VIDEOS` con un JSON; `deploy.yml` la compila en la web como `VITE_ACADEMY_VIDEOS` (no es un secreto: los enlaces son públicos):

```json
{"map": "https://youtu.be/…", "record": {"es": "https://…", "gn": "https://…"}, "offline": "https://…"}
```

Las claves son `map`, `record`, `offline`, `tasks`, `alerts`, `reports`, `team`; cada valor es un enlace (se muestra como español) o un objeto con `es`
y/o `gn`. Solo se aceptan enlaces `https`. Para probar en local: `VITE_ACADEMY_VIDEOS='{...}' pnpm --filter web dev`.

