/** Equipo: miembros, PIN, asignaciones de lotes y baja de la cuenta. */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { isFieldRole, isOverdue, localDate, localTime, newId, type Role } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch, type Stmt } from "../client";
import { funnelEvent } from "../events";
import type { ScopedCtx } from "./ctx";
import { ForbiddenError, NotFoundError, can } from "./permissions";

/** Registra el pedido de baja (solo dueño). Idempotente: si ya hay uno pendiente, lo devuelve. */
export async function requestDeletion(sdb: ScopedCtx): Promise<{
  id: string;
  created: boolean;
  organizationName: string;
  requester: string;
}> {
  sdb.require(can.manageOrg, "Solo el dueño pide la baja de la cuenta");
  const [org] = await sdb.db
    .select({ name: s.organizations.name })
    .from(s.organizations)
    .where(eq(s.organizations.id, sdb.auth.orgId))
    .limit(1);
  const [user] = await sdb.db
    .select({ email: s.users.email, fullName: s.users.fullName })
    .from(s.users)
    .where(eq(s.users.id, sdb.auth.userId))
    .limit(1);
  const requester = `${user?.fullName ?? ""} (${user?.email ?? "sin email"})`;
  const [pending] = await sdb.db
    .select({ id: s.deletionRequests.id })
    .from(s.deletionRequests)
    .where(and(eq(s.deletionRequests.organizationId, sdb.auth.orgId), eq(s.deletionRequests.status, "pending")))
    .limit(1);
  const organizationName = org?.name ?? "";
  if (pending) return { id: pending.id, created: false, organizationName, requester };
  const id = newId();
  await sdb.db.insert(s.deletionRequests).values({
    id,
    organizationId: sdb.auth.orgId,
    userId: sdb.auth.userId,
    createdAt: sdb.now(),
  });
  return { id, created: true, organizationName, requester };
}

/** Miembros con su actividad de los últimos 7 días: tres consultas agrupadas, sin N+1. */
export async function listMembers(sdb: ScopedCtx) {
  sdb.require(can.assign);
  const org = sdb.auth.orgId;
  const since = sdb.now() - 7 * 86_400_000;
  const sinceDay = localDate(sdb.now() - 6 * 86_400_000);
  const withPin = await sdb.membersWithPin();
  const [members, days, recs, syncs, overdueRows, plotRows] = await Promise.all([
    sdb.db
      .select({
        userId: s.users.id,
        fullName: s.users.fullName,
        email: s.users.email,
        phone: s.users.phone,
        role: s.memberships.role,
        status: s.memberships.status,
      })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(and(eq(s.memberships.organizationId, org), isNull(s.memberships.deletedAt))),
    sdb.db
      .select({ userId: s.activityDaily.userId, n: sql<number>`count(*)` })
      .from(s.activityDaily)
      .where(and(eq(s.activityDaily.organizationId, org), gte(s.activityDaily.day, sinceDay)))
      .groupBy(s.activityDaily.userId),
    sdb.db
      .select({ userId: s.records.authorId, n: sql<number>`count(*)` })
      .from(s.records)
      .where(and(eq(s.records.organizationId, org), isNull(s.records.deletedAt), gte(s.records.capturedAt, since)))
      .groupBy(s.records.authorId),
    sdb.db
      .select({ userId: s.devices.userId, at: sql<number | null>`max(${s.devices.lastSyncAt})` })
      .from(s.devices)
      .where(
        sql`${s.devices.userId} IN (SELECT user_id FROM memberships WHERE organization_id = ${org} AND deleted_at IS NULL)`,
      )
      .groupBy(s.devices.userId),
    overdueTasksByAssignee(sdb),
    // Lotes distintos en los que anotó cada persona en 7 días
    sdb.db
      .select({ userId: s.records.authorId, n: sql<number>`count(distinct ${s.records.plotId})` })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, org),
          isNull(s.records.deletedAt),
          gte(s.records.capturedAt, since),
          sql`${s.records.plotId} IS NOT NULL`,
          sdb.workerFilter("records"),
        ),
      )
      .groupBy(s.records.authorId),
  ]);
  const n = (rows: { userId: string; n: number }[]) => new Map(rows.map((r) => [r.userId, Number(r.n)]));
  const activeDays = n(days);
  const records = n(recs);
  const plotsVisited = n(plotRows);
  const lastSync = new Map(syncs.map((r) => [r.userId, r.at]));
  return members.map((m) => ({
    ...m,
    hasPin: withPin.has(m.userId),
    activeDays7: activeDays.get(m.userId) ?? 0,
    records7d: records.get(m.userId) ?? 0,
    plotsVisited7d: plotsVisited.get(m.userId) ?? 0,
    lastSyncAt: lastSync.get(m.userId) ?? null,
    overdueTasks: overdueRows.get(m.userId) ?? 0,
  }));
}

/**
 * Tareas abiertas vencidas por empleado. Vencida = pasó el día, o es hoy y pasó la hora límite, en la hora
 * de la estancia. Las que vencieron hace 2 días o más lo están en cualquier huso (una consulta agrupada); solo las de
 * ayer a mañana se miran una por una con su huso.
 */
async function overdueTasksByAssignee(sdb: ScopedCtx): Promise<Map<string, number>> {
  const now = sdb.now();
  const sure = localDate(now - 2 * 86_400_000);
  const edge = localDate(now + 86_400_000);
  const base = and(
    eq(s.tasks.organizationId, sdb.auth.orgId),
    eq(s.tasks.status, "open"),
    isNull(s.tasks.deletedAt),
    sdb.workerFilter("tasks"),
  );
  const [past, near] = await Promise.all([
    sdb.db
      .select({ userId: s.tasks.assigneeId, n: sql<number>`count(*)` })
      .from(s.tasks)
      .where(and(base, sql`${s.tasks.dueDate} < ${sure}`))
      .groupBy(s.tasks.assigneeId),
    sdb.db
      .select({ userId: s.tasks.assigneeId, dueDate: s.tasks.dueDate, dueTime: s.tasks.dueTime, tz: s.farms.timezone })
      .from(s.tasks)
      .innerJoin(s.farms, eq(s.farms.id, s.tasks.farmId))
      .where(and(base, sql`${s.tasks.dueDate} >= ${sure}`, sql`${s.tasks.dueDate} <= ${edge}`)),
  ]);
  const out = new Map(past.map((r) => [r.userId, Number(r.n)]));
  for (const t of near) {
    if (isOverdue({ status: "open", dueDate: t.dueDate, dueTime: t.dueTime }, localDate(now, t.tz), localTime(now, t.tz)))
      out.set(t.userId, (out.get(t.userId) ?? 0) + 1);
  }
  return out;
}

/** Agrega una persona al equipo con un rol, dentro del límite de usuarios del plan. */
export async function addMember(sdb: ScopedCtx, input: {
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
}): Promise<{ userId: string }> {
  if (isFieldRole(input.role))
    sdb.require(can.manageWorkers, "Solo dueño o administrador crean empleados y contratistas");
  else sdb.require(can.manageOrg, "Solo el dueño gestiona miembros");
  if (!isFieldRole(input.role) && !input.email) throw new ForbiddenError("Falta el email");
  const ts = sdb.now();
  let userId: string | undefined;
  if (input.email) {
    const [u] = await sdb.db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, input.email)).limit(1);
    userId = u?.id;
  }
  await sdb.requireUserRoom(userId ?? null);
  const stmts: Stmt[] = [];
  if (!userId) {
    userId = newId();
    stmts.push(
      sdb.db.insert(s.users).values({
        id: userId,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        createdAt: ts,
        updatedAt: ts,
      }),
    );
  }
  stmts.push(
    sdb.db
      .insert(s.memberships)
      .values({
        id: newId(),
        organizationId: sdb.auth.orgId,
        userId,
        role: input.role,
        createdAt: ts,
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: [s.memberships.organizationId, s.memberships.userId],
        set: { role: input.role, status: "active", deletedAt: null, updatedAt: ts },
      }),
  );
  stmts.push(funnelEvent(sdb.db, "member_added", sdb.auth.orgId, ts));
  stmts.push(...sdb.audit({ action: "member_add", entity: "member", entityId: userId, detail: { role: input.role, name: input.fullName } }));
  await runBatch(sdb.db, stmts);
  return { userId };
}

/** Rol activo de una persona en la organización. Falla con NotFoundError si no es miembro. */
export async function memberRole(sdb: ScopedCtx, userId: string): Promise<Role> {
  const [m] = await sdb.db
    .select({ role: s.memberships.role })
    .from(s.memberships)
    .where(
      and(
        eq(s.memberships.organizationId, sdb.auth.orgId),
        eq(s.memberships.userId, userId),
        isNull(s.memberships.deletedAt),
      ),
    )
    .limit(1);
  if (!m) throw new NotFoundError("El usuario no pertenece a la organización");
  return m.role;
}

/**
 * Fija o cambia el PIN de ingreso de un empleado (solo dueño o administrador). Guarda el teléfono en su
 * ficha y su clave normalizada. "phone_taken" si otra persona ya usa ese teléfono para ingresar.
 */
export async function setMemberPin(sdb: ScopedCtx, 
  userId: string,
  input: { phone: string; phoneKey: string; salt: string; pinHash: string },
): Promise<"ok" | "phone_taken"> {
  sdb.require(can.manageWorkers, "Solo dueño o administrador gestionan el PIN de los empleados");
  if ((await sdb.memberRole(userId)) !== "worker") throw new ForbiddenError("El ingreso con PIN es solo para empleados");
  const [other] = await sdb.db
    .select({ userId: s.userPins.userId })
    .from(s.userPins)
    .where(and(eq(s.userPins.phoneKey, input.phoneKey), sql`${s.userPins.userId} <> ${userId}`))
    .limit(1);
  if (other) return "phone_taken";
  const ts = sdb.now();
  await runBatch(sdb.db, [
    sdb.db.update(s.users).set({ phone: input.phone, updatedAt: ts }).where(eq(s.users.id, userId)),
    sdb.db
      .insert(s.userPins)
      .values({
        userId,
        organizationId: sdb.auth.orgId,
        phoneKey: input.phoneKey,
        salt: input.salt,
        pinHash: input.pinHash,
        createdBy: sdb.auth.userId,
        createdAt: ts,
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: s.userPins.userId,
        set: {
          organizationId: sdb.auth.orgId,
          phoneKey: input.phoneKey,
          salt: input.salt,
          pinHash: input.pinHash,
          failedAttempts: 0,
          lockedUntil: null,
          createdBy: sdb.auth.userId,
          updatedAt: ts,
        },
      }),
  ]);
  return "ok";
}

/** Quita el PIN (el empleado ya no puede ingresar con teléfono). */
export async function clearMemberPin(sdb: ScopedCtx, userId: string): Promise<void> {
  sdb.require(can.manageWorkers, "Solo dueño o administrador gestionan el PIN de los empleados");
  await sdb.memberRole(userId);
  await sdb.db
    .delete(s.userPins)
    .where(and(eq(s.userPins.userId, userId), eq(s.userPins.organizationId, sdb.auth.orgId)));
}

/** Teléfono guardado en la ficha de un miembro de la organización. */
export async function memberPhone(sdb: ScopedCtx, userId: string): Promise<string | null> {
  await sdb.memberRole(userId);
  const [u] = await sdb.db.select({ phone: s.users.phone }).from(s.users).where(eq(s.users.id, userId)).limit(1);
  return u?.phone ?? null;
}

/** Quiénes de la organización ya tienen PIN (para mostrarlo en Equipo). */
export async function membersWithPin(sdb: ScopedCtx): Promise<Set<string>> {
  sdb.require(can.assign);
  const rows = await sdb.db
    .select({ userId: s.userPins.userId })
    .from(s.userPins)
    .where(eq(s.userPins.organizationId, sdb.auth.orgId));
  return new Set(rows.map((r) => r.userId));
}

/** Reemplaza los lotes asignados a un usuario y avisa al cliente que rehaga sus tablas. */
export async function setAssignments(sdb: ScopedCtx, userId: string, plotIds: string[]): Promise<void> {
  sdb.require(can.assign);
  await sdb.memberRole(userId);
  const wanted = [...new Set(plotIds)];
  if (wanted.length) {
    const found = await sdb.db
      .select({ id: s.plots.id })
      .from(s.plots)
      .where(
        and(
          eq(s.plots.organizationId, sdb.auth.orgId),
          inArray(s.plots.id, wanted),
          isNull(s.plots.deletedAt),
          sdb.farmScopeSql("plots.farm_id", true),
        ),
      );
    if (found.length !== wanted.length) throw new NotFoundError("Lote inexistente");
  }
  const current = await sdb.db
    .select({ id: s.plotAssignments.id, plotId: s.plotAssignments.plotId, deletedAt: s.plotAssignments.deletedAt })
    .from(s.plotAssignments)
    .where(and(eq(s.plotAssignments.organizationId, sdb.auth.orgId), eq(s.plotAssignments.userId, userId)));
  const ts = sdb.now();
  const byPlot = new Map(current.map((a) => [a.plotId, a]));
  const stmts: Stmt[] = [bumpVersion(sdb.db)];
  for (const a of current) {
    if (!a.deletedAt && !wanted.includes(a.plotId)) {
      stmts.push(
        sdb.db
          .update(s.plotAssignments)
          .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
          .where(eq(s.plotAssignments.id, a.id)),
      );
    }
  }
  for (const plotId of wanted) {
    const prev = byPlot.get(plotId);
    if (prev && !prev.deletedAt) continue;
    if (prev) {
      stmts.push(
        sdb.db
          .update(s.plotAssignments)
          .set({ deletedAt: null, updatedAt: ts, version: currentVersion })
          .where(eq(s.plotAssignments.id, prev.id)),
      );
    } else {
      stmts.push(
        sdb.db.insert(s.plotAssignments).values({
          id: newId(),
          organizationId: sdb.auth.orgId,
          plotId,
          userId,
          createdAt: ts,
          updatedAt: ts,
          version: currentVersion,
        }),
      );
    }
  }
  if (stmts.length === 1) return;
  stmts.push(
    sdb.db
      .update(s.memberships)
      .set({ assignmentsVersion: sql`${s.memberships.assignmentsVersion} + 1`, updatedAt: ts })
      .where(and(eq(s.memberships.organizationId, sdb.auth.orgId), eq(s.memberships.userId, userId))),
  );
  stmts.push(...sdb.audit({ action: "member_plots", entity: "member", entityId: userId, detail: { plots: wanted.length } }));
  await runBatch(sdb.db, stmts);
}
