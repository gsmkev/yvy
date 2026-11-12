/** I-01: tokens de la API pública. Gestión desde la web (solo el dueño) y verificación en /v1. */
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { LIMITS, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { randomToken, sha256Hex } from "../lib/crypto";
import type { DB } from "./client";
import { can, ForbiddenError, NotFoundError, type ScopedDb } from "./scoped";

export const TOKEN_PREFIX = "yvy_";

export async function listApiTokens(sdb: ScopedDb) {
  sdb.require(can.manageApiTokens, "Solo el dueño gestiona la API");
  return sdb.db
    .select({
      id: s.apiTokens.id,
      name: s.apiTokens.name,
      prefix: s.apiTokens.prefix,
      createdAt: s.apiTokens.createdAt,
      lastUsedAt: s.apiTokens.lastUsedAt,
    })
    .from(s.apiTokens)
    .where(and(eq(s.apiTokens.organizationId, sdb.auth.orgId), isNull(s.apiTokens.revokedAt)))
    .orderBy(s.apiTokens.createdAt);
}

/** Crea un token y lo devuelve una sola vez: después solo queda el hash. */
export async function createApiToken(sdb: ScopedDb, name: string) {
  sdb.require(can.manageApiTokens, "Solo el dueño gestiona la API");
  if (sdb.auth.readOnly) throw new ForbiddenError("Sesión de solo lectura");
  const [n] = await sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.apiTokens)
    .where(and(eq(s.apiTokens.organizationId, sdb.auth.orgId), isNull(s.apiTokens.revokedAt)));
  if (Number(n?.n ?? 0) >= LIMITS.api.maxTokensPerOrg)
    throw new ForbiddenError(`Se admiten hasta ${LIMITS.api.maxTokensPerOrg} tokens; revocá alguno`);
  const token = `${TOKEN_PREFIX}${randomToken(32)}`;
  const id = newId();
  await sdb.db.insert(s.apiTokens).values({
    id,
    organizationId: sdb.auth.orgId,
    name,
    tokenHash: await sha256Hex(token),
    prefix: token.slice(0, 8),
    createdBy: sdb.auth.userId,
    createdAt: sdb.now(),
  });
  return { id, token };
}

export async function revokeApiToken(sdb: ScopedDb, id: string) {
  sdb.require(can.manageApiTokens, "Solo el dueño gestiona la API");
  const res = await sdb.db
    .update(s.apiTokens)
    .set({ revokedAt: sdb.now() })
    .where(and(eq(s.apiTokens.id, id), eq(s.apiTokens.organizationId, sdb.auth.orgId), isNull(s.apiTokens.revokedAt)))
    .returning({ id: s.apiTokens.id });
  if (!res.length) throw new NotFoundError("No existe");
}

/**
 * Acceso de sistema (la petición todavía no tiene organización): busca el token por su hash. Anota el último uso
 * como mucho una vez por hora y cuenta el pedido en la ventana del minuto. Devuelve `limited: true` pasado el tope.
 */
export async function verifyApiToken(
  db: DB,
  token: string,
  now: number,
): Promise<{ id: string; orgId: string; limited: boolean } | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ id: s.apiTokens.id, orgId: s.apiTokens.organizationId, lastUsedAt: s.apiTokens.lastUsedAt })
    .from(s.apiTokens)
    .where(and(eq(s.apiTokens.tokenHash, await sha256Hex(token)), isNull(s.apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  const window = Math.floor(now / 60_000);
  const [rate] = await db
    .insert(s.apiRate)
    .values({ tokenId: row.id, window, n: 1 })
    .onConflictDoUpdate({ target: [s.apiRate.tokenId, s.apiRate.window], set: { n: sql`${s.apiRate.n} + 1` } })
    .returning({ n: s.apiRate.n });
  if (!row.lastUsedAt || now - row.lastUsedAt > 3_600_000)
    await db.update(s.apiTokens).set({ lastUsedAt: now }).where(eq(s.apiTokens.id, row.id));
  return { id: row.id, orgId: row.orgId, limited: (rate?.n ?? 0) > LIMITS.api.perMinute };
}

/** Mantenimiento: las ventanas de más de una hora no sirven. */
export async function purgeApiRate(db: DB, now: number) {
  await db.delete(s.apiRate).where(lt(s.apiRate.window, Math.floor(now / 60_000) - 60));
}
