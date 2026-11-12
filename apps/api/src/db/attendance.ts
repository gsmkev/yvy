/**
 * Asistencia y jornales (E-25). Cada asistencia carga un costo de mano de obra (categoría `labor`) al lote, con su
 * campaña, o a administración si no hay lote. Un empleado no puede sumar más de un día por fecha.
 * Son montos: solo dueño y administrador.
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { LIMITS, newId, noonAsuncion, wageFor } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, runBatch, type Stmt } from "./client";
import { resolveCenter } from "./costs";
import { can, NotFoundError, type ScopedDb } from "./scoped";

interface Entry {
  employeeId: string;
  days: 1 | 0.5;
  farmId?: string | null;
  plotId?: string | null;
  seasonId?: string | null;
  labor?: string | null;
  wagePyg?: number | null;
}

export async function listAttendance(sdb: ScopedDb, f: { employeeId?: string; from?: string; to?: string }) {
  sdb.require(can.manageErp);
  return sdb.db
    .select()
    .from(s.attendance)
    .where(
      and(
        eq(s.attendance.organizationId, sdb.auth.orgId),
        isNull(s.attendance.deletedAt),
        f.employeeId ? eq(s.attendance.employeeId, f.employeeId) : undefined,
        f.from ? gte(s.attendance.date, f.from) : undefined,
        f.to ? lte(s.attendance.date, f.to) : undefined,
      ),
    )
    .orderBy(desc(s.attendance.date))
    .limit(LIMITS.erp.listLimit);
}

/** Registra la asistencia de un día para varios empleados de una vez. Todo o nada. */
export async function markDay(sdb: ScopedDb, date: string, entries: Entry[]) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const ids = [...new Set(entries.map((e) => e.employeeId))];
  const [staff, already] = await Promise.all([
    sdb.db
      .select({ id: s.employees.id, name: s.employees.name, dailyWagePyg: s.employees.dailyWagePyg })
      .from(s.employees)
      .where(and(eq(s.employees.organizationId, org), isNull(s.employees.deletedAt), inArray(s.employees.id, ids))),
    sdb.db
      .select({ employeeId: s.attendance.employeeId, days: sql<number>`SUM(${s.attendance.days})` })
      .from(s.attendance)
      .where(
        and(eq(s.attendance.organizationId, org), eq(s.attendance.date, date), isNull(s.attendance.deletedAt), inArray(s.attendance.employeeId, ids)),
      )
      .groupBy(s.attendance.employeeId),
  ]);
  const byId = new Map(staff.map((e) => [e.id, e]));
  const days = new Map(already.map((a) => [a.employeeId, a.days]));
  for (const e of entries) {
    const emp = byId.get(e.employeeId);
    if (!emp) throw new NotFoundError("El empleado no existe");
    const total = (days.get(e.employeeId) ?? 0) + e.days;
    if (total > 1 + 1e-9) throw new HTTPException(409, { message: `${emp.name} ya tiene el día completo cargado` });
    days.set(e.employeeId, total);
  }
  // Cada lote o estancia se valida una sola vez.
  const plotIds = [...new Set(entries.flatMap((e) => (e.plotId ? [e.plotId] : [])))];
  const kinds = new Map<string, string>();
  for (const chunk of chunkForParams(plotIds, 2))
    for (const p of await sdb.db
      .select({ id: s.plots.id, kind: s.plots.kind })
      .from(s.plots)
      .where(and(eq(s.plots.organizationId, org), isNull(s.plots.deletedAt), inArray(s.plots.id, chunk))))
      kinds.set(p.id, p.kind);
  const centers = new Map<string, Awaited<ReturnType<typeof resolveCenter>>>();
  for (const e of entries) {
    const key = `${e.farmId ?? ""}|${e.plotId ?? ""}|${e.seasonId ?? ""}`;
    if (!centers.has(key)) centers.set(key, await resolveCenter(sdb, { farmId: e.farmId, plotId: e.plotId, seasonId: e.seasonId, partyId: null }));
  }
  const ts = sdb.now();
  const rows: (typeof s.attendance.$inferInsert)[] = [];
  const costs: (typeof s.costEntries.$inferInsert)[] = [];
  for (const e of entries) {
    const emp = byId.get(e.employeeId)!;
    const c = centers.get(`${e.farmId ?? ""}|${e.plotId ?? ""}|${e.seasonId ?? ""}`)!;
    const id = newId();
    const wage = e.wagePyg ?? wageFor(emp.dailyWagePyg, e.days);
    rows.push({
      id,
      organizationId: org,
      employeeId: e.employeeId,
      date,
      days: e.days,
      farmId: c.farmId,
      plotId: c.plotId,
      seasonId: c.seasonId,
      labor: e.labor?.trim() || null,
      wagePyg: wage,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    });
    if (wage > 0)
      costs.push({
        id: newId(),
        organizationId: org,
        occurredAt: noonAsuncion(date),
        farmId: c.farmId,
        plotId: c.plotId,
        seasonId: c.seasonId,
        activity: !c.plotId ? "administracion" : kinds.get(c.plotId) === "pasture" ? "ganaderia" : "agricultura",
        category: "labor",
        description: [emp.name, e.labor?.trim()].filter(Boolean).join(": ").slice(0, 200),
        amount: wage,
        currency: "PYG",
        amountPyg: wage,
        origin: "attendance",
        originId: id,
        createdBy: sdb.auth.userId,
        createdAt: ts,
        updatedAt: ts,
      });
  }
  // Con 13 y 21 columnas por fila: 6 y 4 filas por sentencia (tope de 100 parámetros de D1).
  const stmts: Stmt[] = [
    ...chunkForParams(rows, 13).map((c) => sdb.db.insert(s.attendance).values(c)),
    ...chunkForParams(costs, 22).map((c) => sdb.db.insert(s.costEntries).values(c)),
  ];
  await runBatch(sdb.db, stmts);
  return { ids: rows.map((r) => r.id as string) };
}

export async function deleteAttendance(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const where = and(eq(s.attendance.id, id), eq(s.attendance.organizationId, org), isNull(s.attendance.deletedAt));
  const [row] = await sdb.db.select({ id: s.attendance.id }).from(s.attendance).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  const ts = sdb.now();
  const gone = { deletedAt: ts, updatedAt: ts };
  await runBatch(sdb.db, [
    sdb.db.update(s.attendance).set(gone).where(where),
    sdb.db
      .update(s.costEntries)
      .set(gone)
      .where(and(eq(s.costEntries.organizationId, org), eq(s.costEntries.origin, "attendance"), eq(s.costEntries.originId, id))),
  ]);
}

/** Días y jornales por empleado en un período. */
export async function attendanceSummary(sdb: ScopedDb, f: { from?: string; to?: string }) {
  sdb.require(can.manageErp);
  return sdb.db
    .select({
      employeeId: s.attendance.employeeId,
      days: sql<number>`SUM(${s.attendance.days})`,
      wagePyg: sql<number>`SUM(${s.attendance.wagePyg})`,
    })
    .from(s.attendance)
    .where(
      and(
        eq(s.attendance.organizationId, sdb.auth.orgId),
        isNull(s.attendance.deletedAt),
        f.from ? gte(s.attendance.date, f.from) : undefined,
        f.to ? lte(s.attendance.date, f.to) : undefined,
      ),
    )
    .groupBy(s.attendance.employeeId);
}
