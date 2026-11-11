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
`ALLOW_SIGNUP` (`true` para el piloto), `EAS_PROJECT_ID` (opcional).

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
