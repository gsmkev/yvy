/** R-10: informes programados por email a terceros (socio, agrónomo, banco). Solo dueño y administrador. */
import { and, eq, isNull, sql } from "drizzle-orm";
import { LIMITS, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, ForbiddenError, NotFoundError, type ScopedDb } from "./scoped";

export async function listSchedules(sdb: ScopedDb) {
  sdb.require(can.scheduleReports, "Solo el dueño o un administrador programan informes");
  return sdb.db
    .select({
      id: s.reportSchedules.id,
      farmId: s.reportSchedules.farmId,
      name: s.reportSchedules.name,
      email: s.reportSchedules.email,
      frequency: s.reportSchedules.frequency,
      lastSentAt: s.reportSchedules.lastSentAt,
    })
    .from(s.reportSchedules)
    .where(and(eq(s.reportSchedules.organizationId, sdb.auth.orgId), isNull(s.reportSchedules.deletedAt)))
    .orderBy(s.reportSchedules.createdAt);
}

export async function createSchedule(
  sdb: ScopedDb,
  input: { farmId: string | null; name: string; email: string; frequency: "weekly" | "monthly" },
) {
  sdb.require(can.scheduleReports, "Solo el dueño o un administrador programan informes");
  if (input.farmId) await sdb.requireFarm(input.farmId, true);
  else if (await sdb.isFarmRestricted()) throw new ForbiddenError("Con acceso limitado a ciertas estancias, elegí una estancia");
  const [n] = await sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.reportSchedules)
    .where(and(eq(s.reportSchedules.organizationId, sdb.auth.orgId), isNull(s.reportSchedules.deletedAt)));
  if (Number(n?.n ?? 0) >= LIMITS.reportSchedules.max)
    throw new ForbiddenError(`Se admiten hasta ${LIMITS.reportSchedules.max} destinatarios`);
  const id = newId();
  await sdb.db.insert(s.reportSchedules).values({
    id,
    organizationId: sdb.auth.orgId,
    farmId: input.farmId,
    name: input.name,
    email: input.email,
    frequency: input.frequency,
    createdBy: sdb.auth.userId,
    createdAt: sdb.now(),
  });
  return { id };
}

export async function deleteSchedule(sdb: ScopedDb, id: string) {
  sdb.require(can.scheduleReports, "Solo el dueño o un administrador programan informes");
  const res = await sdb.db
    .update(s.reportSchedules)
    .set({ deletedAt: sdb.now() })
    .where(
      and(
        eq(s.reportSchedules.id, id),
        eq(s.reportSchedules.organizationId, sdb.auth.orgId),
        isNull(s.reportSchedules.deletedAt),
      ),
    )
    .returning({ id: s.reportSchedules.id });
  if (!res.length) throw new NotFoundError("No existe");
}
