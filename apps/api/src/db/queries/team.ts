/** Baja de miembros y dispositivos (push). */
import { and, eq, isNull, sql } from "drizzle-orm";
import { isFieldRole } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runBatch, type Stmt } from "../client";
import { can, ForbiddenError, type ScopedDb } from "../scoped";

export async function removeMember(sdb: ScopedDb, userId: string) {
  const role = await sdb.memberRole(userId);
  if (isFieldRole(role)) sdb.require(can.manageWorkers);
  else sdb.require(can.manageOrg, "Solo el dueño gestiona miembros");
  if (userId === sdb.auth.userId) throw new ForbiddenError("No podés darte de baja a vos mismo");
  const ts = sdb.now();
  await runBatch(sdb.db, [
    sdb.db
      .update(s.memberships)
      .set({ status: "disabled", deletedAt: ts, updatedAt: ts })
      .where(and(eq(s.memberships.organizationId, sdb.auth.orgId), eq(s.memberships.userId, userId))),
    sdb.db
      .update(s.refreshTokens)
      .set({ revokedAt: ts })
      .where(
        and(
          eq(s.refreshTokens.userId, userId),
          eq(s.refreshTokens.organizationId, sdb.auth.orgId),
          isNull(s.refreshTokens.revokedAt),
        ),
      ),
    ...sdb.audit({ action: "member_remove", entity: "member", entityId: userId, detail: { role } }),
  ]);
}

// ---------- Dispositivos (push) ----------

export async function registerDevice(
  sdb: ScopedDb,
  d: { id: string; platform: string; appVersion: string | null; pushToken: string | null },
) {
  const [existing] = await sdb.db
    .select({ userId: s.devices.userId })
    .from(s.devices)
    .where(eq(s.devices.id, d.id))
    .limit(1);
  const stmts: Stmt[] = [];
  if (existing && existing.userId !== sdb.auth.userId) {
    // El mismo celular pasó a otro usuario: el token de push queda solo para el nuevo.
    stmts.push(sdb.db.delete(s.devices).where(eq(s.devices.id, d.id)));
  }
  if (d.pushToken) {
    stmts.push(
      sdb.db
        .update(s.devices)
        .set({ pushToken: null })
        .where(and(eq(s.devices.pushToken, d.pushToken), sql`${s.devices.id} <> ${d.id}`)),
    );
  }
  stmts.push(
    sdb.db
      .insert(s.devices)
      .values({ ...d, userId: sdb.auth.userId, lastSyncAt: sdb.now() })
      .onConflictDoUpdate({
        target: s.devices.id,
        set: {
          userId: sdb.auth.userId,
          platform: d.platform,
          appVersion: d.appVersion,
          pushToken: d.pushToken,
          lastSyncAt: sdb.now(),
        },
      }),
  );
  await runBatch(sdb.db, stmts);
}
