/** Enlaces de solo lectura. */
import { and, desc, eq, isNull } from "drizzle-orm";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { newId } from "@yvy/shared";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { can, ForbiddenError, NotFoundError, type ScopedDb } from "../scoped";

// ---------- Enlaces de solo lectura ----------

/** Crea el enlace; devuelve el token en claro una sola vez (en la base queda su hash). */
export async function createShareLink(sdb: ScopedDb, farmId: string, days: number) {
  sdb.require(can.shareLinks, "Solo el dueño crea enlaces para compartir");
  if (!(LIMITS.share.linkDays as readonly number[]).includes(days)) throw new ForbiddenError("Duración no permitida");
  await sdb.requireFarm(farmId);
  const token = randomToken(32);
  const id = newId();
  const ts = sdb.now();
  const expiresAt = ts + days * 86_400_000;
  await sdb.db.insert(s.shareLinks).values({
    id,
    organizationId: sdb.auth.orgId,
    farmId,
    tokenHash: await sha256Hex(token),
    createdBy: sdb.auth.userId,
    createdAt: ts,
    expiresAt,
  });
  return { id, token, expiresAt };
}

/** Enlaces para compartir una estancia. */
export async function listShareLinks(sdb: ScopedDb, farmId: string) {
  sdb.require(can.shareLinks, "Solo el dueño ve los enlaces para compartir");
  await sdb.requireFarm(farmId);
  return sdb.db
    .select({
      id: s.shareLinks.id,
      createdAt: s.shareLinks.createdAt,
      expiresAt: s.shareLinks.expiresAt,
      revokedAt: s.shareLinks.revokedAt,
    })
    .from(s.shareLinks)
    .where(and(eq(s.shareLinks.farmId, farmId), eq(s.shareLinks.organizationId, sdb.auth.orgId)))
    .orderBy(desc(s.shareLinks.createdAt))
    .limit(50);
}

/** Revoca un enlace para compartir. */
export async function revokeShareLink(sdb: ScopedDb, id: string) {
  sdb.require(can.shareLinks, "Solo el dueño revoca enlaces");
  const [row] = await sdb.db
    .select({ id: s.shareLinks.id })
    .from(s.shareLinks)
    .where(and(eq(s.shareLinks.id, id), eq(s.shareLinks.organizationId, sdb.auth.orgId)))
    .limit(1);
  if (!row) throw new NotFoundError("Enlace inexistente");
  await sdb.db
    .update(s.shareLinks)
    .set({ revokedAt: sdb.now() })
    .where(and(eq(s.shareLinks.id, id), isNull(s.shareLinks.revokedAt)));
}
