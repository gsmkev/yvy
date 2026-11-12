#!/usr/bin/env bash
# Puesta en marcha de Yvy en Cloudflare (una sola vez). Requiere CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID.
# Uso: APP_ORIGIN=https://yvy-api.<subdominio>.workers.dev ./scripts/setup-cloudflare.sh
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
: "${CLOUDFLARE_API_TOKEN:?Falta CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Falta CLOUDFLARE_ACCOUNT_ID}"
: "${APP_ORIGIN:?Falta APP_ORIGIN (URL pública de la web, para el CORS de las fotos)}"
W="npx wrangler"

echo "▸ Base D1"
# Buscar por nombre con `d1 list`: `d1 info yvy` usa el database_id de wrangler.jsonc,
# que en la primera ejecución todavía es el placeholder.
db_id() { $W d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).find((x)=>x.name==="yvy");if(d)console.log(d.uuid)})'; }
DB_ID=$(db_id || true)
if [ -z "$DB_ID" ]; then $W d1 create yvy >/dev/null; DB_ID=$(db_id); fi
sed -i.bak "s/\"database_id\": \"[^\"]*\"/\"database_id\": \"$DB_ID\"/" wrangler.jsonc && rm -f wrangler.jsonc.bak
echo "  database_id=$DB_ID  → guardalo como secret D1_DATABASE_ID en GitHub"

echo "▸ Buckets R2"
for b in yvy-media yvy-tiles; do $W r2 bucket info "$b" >/dev/null 2>&1 || $W r2 bucket create "$b"; done
$W r2 bucket dev-url enable yvy-tiles -y
$W r2 bucket cors set yvy-tiles --file ../../infra/cors-tiles.json -y
sed "s#APP_ORIGIN#${APP_ORIGIN}#" ../../infra/cors-media.json > /tmp/yvy-cors-media.json
$W r2 bucket cors set yvy-media --file /tmp/yvy-cors-media.json -y
echo "  URL pública de teselas (variable TILES_PUBLIC_URL):"
$W r2 bucket dev-url get yvy-tiles

echo "▸ Cola"
$W queues info yvy-jobs >/dev/null 2>&1 || $W queues create yvy-jobs

echo "▸ Migraciones y primer deploy"
$W d1 migrations apply yvy --remote
(cd ../web && pnpm build)
$W deploy --var APP_ENV:production --var APP_URL:"$APP_ORIGIN"

echo "▸ Secrets del Worker"
JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 48)}
INGEST_SECRET=${INGEST_SECRET:-$(openssl rand -hex 32)}
printf %s "$JWT_SECRET" | $W secret put JWT_SECRET
printf %s "$INGEST_SECRET" | $W secret put INGEST_SECRET
for s in RESEND_API_KEY R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if [ -n "${!s:-}" ]; then printf %s "${!s}" | $W secret put "$s"; else echo "  (pendiente) $W secret put $s"; fi
done
echo
echo "Listo. Guardá este valor como secret YVY_INGEST_SECRET en GitHub (lo usan los jobs Python):"
echo "  $INGEST_SECRET"
