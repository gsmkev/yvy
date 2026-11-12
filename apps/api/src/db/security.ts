/** P-08: política de segundo factor de la organización. Solo la fija el dueño; los administradores quedan obligados. */
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { can, ForbiddenError, type ScopedDb } from "./scoped";

export async function getSecurity(sdb: ScopedDb) {
  sdb.require(can.manageOrg, "Solo el dueño gestiona la seguridad de la organización");
  const [org] = await sdb.db
    .select({ on: s.organizations.requireAdminTotp })
    .from(s.organizations)
    .where(eq(s.organizations.id, sdb.auth.orgId))
    .limit(1);
  const admins = await sdb.db
    .select({ userId: s.users.id, fullName: s.users.fullName })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(
      and(
        eq(s.memberships.organizationId, sdb.auth.orgId),
        eq(s.memberships.role, "admin"),
        eq(s.memberships.status, "active"),
        isNull(s.memberships.deletedAt),
      ),
    )
    .limit(80);
  const on = admins.length
    ? await sdb.db
        .select({ userId: s.userTotp.userId })
        .from(s.userTotp)
        .where(
          and(
            inArray(
              s.userTotp.userId,
              admins.map((a) => a.userId),
            ),
            isNotNull(s.userTotp.enabledAt),
          ),
        )
    : [];
  const enrolled = new Set(on.map((r) => r.userId));
  return {
    requireAdminTotp: !!org?.on,
    admins: admins.map((a) => ({ userId: a.userId, fullName: a.fullName, totp: enrolled.has(a.userId) })),
  };
}

export async function setRequireAdminTotp(sdb: ScopedDb, value: boolean) {
  sdb.require(can.manageOrg, "Solo el dueño gestiona la seguridad de la organización");
  if (sdb.auth.readOnly) throw new ForbiddenError("Sesión de solo lectura");
  await sdb.db
    .update(s.organizations)
    .set({ requireAdminTotp: value, updatedAt: sdb.now() })
    .where(eq(s.organizations.id, sdb.auth.orgId));
}
