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
2. En *Actions → Jobs de datos* corré `climatology_build` y `s2_basemap` (o esperá al domingo).
3. Creá empleados en **Equipo**, asignales lotes y mostrales el QR de vinculación.
4. El empleado instala el APK, escanea el QR y baja el *Mapa sin conexión* por wifi.

## 6. Pasar a pago (cuando haga falta)

Todos los límites están en `packages/shared/src/limits.ts`. Workers Paid (US$ 5/mes) quita el techo de CPU y de requests;
R2 cobra US$ 0,015/GB/mes después de 10 GB. No hace falta cambiar código.
