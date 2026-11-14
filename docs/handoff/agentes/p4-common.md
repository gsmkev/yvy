REGLAS COMUNES (léelas antes de empezar):
- Repo /home/user/yvy (monorepo pnpm). Lee CLAUDE.md, docs/PRD-cloudflare.md, docs/adr/0004-modulos-campo-y-erp.md y la fila de cada ítem en docs/BACKLOG.md.
- Trabajás en tu worktree aislado. Lo PRIMERO: `git checkout -B <tu-rama> d2d9bfc` (ése es el tip con todo lo integrado; no uses otra base). No hagas push, no toques main ni otras ramas, nada de --force.
- Un commit por ítem, en el orden dado, con el asunto "<ID> <descripción breve en es-PY>" y autor Claude: `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`. Terminá cada mensaje de commit con:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0121m53sSAVCQWNjm4XffNBA
- Cada commit debe pasar por sí solo: pnpm typecheck, pnpm lint, pnpm test (y `cd workers-py && uv run pytest` si tocás Python). Marcá el ítem como "Hecho" en docs/BACKLOG.md en el mismo commit.
- Cambio de esquema: editá packages/shared/src/schema.ts, luego `pnpm --filter api db:generate && node apps/mobile/scripts/gen-schema.mjs` y `pnpm --filter api db:migrate:local`. No importa el número de migración; se renumera al integrar.
- Reglas del Worker: 10 ms CPU, ≤40 queries, ≤100 parámetros (chunkForParams), db.batch(), ScopedDb siempre, bumpVersion() en tablas sincronizables, permisos en `can` de apps/api/src/db/scoped.ts con test en apps/api/test por cada permiso nuevo. Lo pesado (interpolación, rasters, archivos binarios grandes) va a workers-py y escribe por /ingest firmado.
- Textos solo vía i18n es-PY con voseo. Límites solo en packages/shared/src/limits.ts. Esquemas de registros solo en records.ts.
- Diseño de diseñador senior, sin "AI slop": nada de pills/badges, eyebrows en mayúsculas, íconos decorativos ni subtítulos genéricos. Usá los componentes y la paleta existentes (lino, surco, soja, trigo, cielo, alerta). Fraunces para títulos, Inter para el resto.
- Fuentes de datos permitidas solamente: Sentinel-2, CHIRPS, NASA POWER, NASA FIRMS, MET Norway. Si un ítem necesita datos externos que no están ahí, usá una fuente con licencia que permita uso comercial y anotalo en el commit; si no la hay, dejá el ítem sin hacer y explicalo.
- No inventes datos de relleno en la UI. Estados vacíos honestos.
- Al terminar, informá: la lista de hashes en orden con su ID, qué quedó fuera y por qué, y cualquier cosa que el usuario deba configurar.
