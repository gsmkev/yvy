# Yvy

Mapa vivo del campo que funciona sin señal. Ver `docs/PRD.md` y `docs/PRD-cloudflare.md`.

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm --filter api db:migrate:local
pnpm --filter api seed
pnpm --filter api dev      # http://localhost:8787
pnpm test
```

## Puesta en Cloudflare (una vez)

```bash
cd apps/api
npx wrangler d1 create yvy             # copiar database_id a wrangler.jsonc
npx wrangler r2 bucket create yvy-media
npx wrangler r2 bucket create yvy-tiles
npx wrangler queues create yvy-jobs
npx wrangler secret put JWT_SECRET     # y INGEST_SECRET, RESEND_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
pnpm db:migrate:remote
pnpm deploy
```
