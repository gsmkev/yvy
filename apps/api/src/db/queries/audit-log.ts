/** Registro de cambios. */
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, type ScopedDb } from "../scoped";

// ---------- Registro de cambios ----------

/** El dueño ve quién cambió qué y cuándo, de más nuevo a más viejo; `before` (epoch ms) pagina. */
export async function listAudit(sdb: ScopedDb, f: { entity?: string; before?: number; limit?: number }) {
  sdb.require(can.viewAudit, "Solo el dueño ve el registro de cambios");
  const limit = Math.min(f.limit ?? LIMITS.audit.pageSize, 200);
  const rows = await sdb.db
    .select({
      id: s.auditLog.id,
      action: s.auditLog.action,
      entity: s.auditLog.entity,
      entityId: s.auditLog.entityId,
      detail: s.auditLog.detail,
      createdAt: s.auditLog.createdAt,
      actorId: s.auditLog.actorUserId,
      actor: s.users.fullName,
    })
    .from(s.auditLog)
    .leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId))
    .where(
      and(
        eq(s.auditLog.organizationId, sdb.auth.orgId),
        // las acciones del equipo de Yvy (soporte, plan) no llevan entidad y no son del dueño
        sql`${s.auditLog.entity} IS NOT NULL`,
        f.entity ? eq(s.auditLog.entity, f.entity) : undefined,
        f.before ? lt(s.auditLog.createdAt, f.before) : undefined,
      ),
    )
    .orderBy(desc(s.auditLog.createdAt), desc(s.auditLog.id))
    .limit(limit + 1);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}
