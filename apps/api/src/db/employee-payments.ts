/** Adelantos, pagos y saldo por empleado (E-26). Montos: solo dueño y administrador. */
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { buildPayroll, employeeBalance, LIMITS, monthsBetween, newId, statement, type EmployeePaymentKind, type StatementLine } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requireOwned } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export async function createPayment(
  sdb: ScopedDb,
  i: { employeeId: string; date: string; kind: EmployeePaymentKind; amountPyg: number; note?: string | null },
) {
  sdb.require(can.manageErp);
  await requireOwned(sdb, s.employees, i.employeeId, "El empleado");
  const ts = sdb.now();
  const id = newId();
  await sdb.db.insert(s.employeePayments).values({
    id,
    organizationId: sdb.auth.orgId,
    employeeId: i.employeeId,
    date: i.date,
    kind: i.kind,
    amountPyg: i.amountPyg,
    note: i.note?.trim() || null,
    createdBy: sdb.auth.userId,
    createdAt: ts,
    updatedAt: ts,
  });
  return { id };
}

export async function deletePayment(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const where = and(eq(s.employeePayments.id, id), eq(s.employeePayments.organizationId, sdb.auth.orgId), isNull(s.employeePayments.deletedAt));
  const [row] = await sdb.db.select({ id: s.employeePayments.id }).from(s.employeePayments).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  const ts = sdb.now();
  await sdb.db.update(s.employeePayments).set({ deletedAt: ts, updatedAt: ts }).where(where);
}

export async function listPayments(sdb: ScopedDb, employeeId?: string) {
  sdb.require(can.manageErp);
  return sdb.db
    .select()
    .from(s.employeePayments)
    .where(
      and(
        eq(s.employeePayments.organizationId, sdb.auth.orgId),
        isNull(s.employeePayments.deletedAt),
        employeeId ? eq(s.employeePayments.employeeId, employeeId) : undefined,
      ),
    )
    .orderBy(desc(s.employeePayments.date), desc(s.employeePayments.createdAt))
    .limit(LIMITS.erp.listLimit);
}

/** Devengado, adelantos, pagos y saldo de cada empleado hasta `to` (inclusive). Tres consultas. */
export async function balances(sdb: ScopedDb, to?: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const [staff, accrued, paid] = await Promise.all([
    sdb.db
      .select({ id: s.employees.id, name: s.employees.name })
      .from(s.employees)
      .where(and(eq(s.employees.organizationId, org), isNull(s.employees.deletedAt)))
      .orderBy(asc(s.employees.name)),
    sdb.db
      .select({ employeeId: s.attendance.employeeId, days: sql<number>`SUM(${s.attendance.days})`, pyg: sql<number>`SUM(${s.attendance.wagePyg})` })
      .from(s.attendance)
      .where(and(eq(s.attendance.organizationId, org), isNull(s.attendance.deletedAt), to ? lte(s.attendance.date, to) : undefined))
      .groupBy(s.attendance.employeeId),
    sdb.db
      .select({ employeeId: s.employeePayments.employeeId, kind: s.employeePayments.kind, pyg: sql<number>`SUM(${s.employeePayments.amountPyg})` })
      .from(s.employeePayments)
      .where(and(eq(s.employeePayments.organizationId, org), isNull(s.employeePayments.deletedAt), to ? lte(s.employeePayments.date, to) : undefined))
      .groupBy(s.employeePayments.employeeId, s.employeePayments.kind),
  ]);
  return staff.map((e) => {
    const a = accrued.find((x) => x.employeeId === e.id);
    const advances = paid.find((x) => x.employeeId === e.id && x.kind === "advance")?.pyg ?? 0;
    const payments = paid.find((x) => x.employeeId === e.id && x.kind === "payment")?.pyg ?? 0;
    return {
      employeeId: e.id,
      name: e.name,
      days: a?.days ?? 0,
      accruedPyg: a?.pyg ?? 0,
      advancesPyg: advances,
      paymentsPyg: payments,
      balancePyg: employeeBalance(a?.pyg ?? 0, advances, payments),
    };
  });
}

/** Cuenta corriente de un empleado: jornales, adelantos y pagos en orden con el saldo acumulado. Tres consultas. */
export async function employeeStatement(sdb: ScopedDb, employeeId: string) {
  sdb.require(can.manageErp);
  await requireOwned(sdb, s.employees, employeeId, "El empleado");
  const org = sdb.auth.orgId;
  const [wages, pays] = await Promise.all([
    sdb.db
      .select()
      .from(s.attendance)
      .where(and(eq(s.attendance.organizationId, org), eq(s.attendance.employeeId, employeeId), isNull(s.attendance.deletedAt)))
      .orderBy(desc(s.attendance.date))
      .limit(LIMITS.erp.listLimit),
    sdb.db
      .select()
      .from(s.employeePayments)
      .where(and(eq(s.employeePayments.organizationId, org), eq(s.employeePayments.employeeId, employeeId), isNull(s.employeePayments.deletedAt)))
      .orderBy(desc(s.employeePayments.date))
      .limit(LIMITS.erp.listLimit),
  ]);
  const lines: StatementLine[] = [
    ...wages.map((w): StatementLine => ({ id: w.id, date: w.date, kind: "wage", amountPyg: w.wagePyg, note: w.labor })),
    ...pays.map((p): StatementLine => ({ id: p.id, date: p.date, kind: p.kind, amountPyg: -p.amountPyg, note: p.note })),
  ];
  return statement(lines);
}

/**
 * Planilla para el contador (E-27): jornales, adelantos y pagos por empleado y mes entre dos fechas. Sin aportes ni
 * descuentos. Tres consultas agrupadas; el Excel se arma en el navegador. Solo dueño y administrador.
 */
export async function payroll(sdb: ScopedDb, from: string, to: string) {
  sdb.require(can.manageErp);
  if (from > to) throw new HTTPException(400, { message: "La fecha inicial es posterior a la final" });
  if (monthsBetween(from, to).length > LIMITS.payroll.maxMonths)
    throw new HTTPException(400, { message: `Elegí un período de hasta ${LIMITS.payroll.maxMonths} meses` });
  const org = sdb.auth.orgId;
  const a = s.attendance;
  const p = s.employeePayments;
  const [staff, accruals, payments] = await Promise.all([
    sdb.db
      .select({ id: s.employees.id, name: s.employees.name, ci: s.employees.ci })
      .from(s.employees)
      .where(and(eq(s.employees.organizationId, org), isNull(s.employees.deletedAt))),
    sdb.db
      .select({ employeeId: a.employeeId, month: sql<string>`substr(${a.date}, 1, 7)`, days: sql<number>`SUM(${a.days})`, wagePyg: sql<number>`SUM(${a.wagePyg})` })
      .from(a)
      .where(and(eq(a.organizationId, org), isNull(a.deletedAt), gte(a.date, from), lte(a.date, to)))
      .groupBy(a.employeeId, sql`substr(${a.date}, 1, 7)`),
    sdb.db
      .select({ employeeId: p.employeeId, month: sql<string>`substr(${p.date}, 1, 7)`, kind: p.kind, amountPyg: sql<number>`SUM(${p.amountPyg})` })
      .from(p)
      .where(and(eq(p.organizationId, org), isNull(p.deletedAt), gte(p.date, from), lte(p.date, to)))
      .groupBy(p.employeeId, sql`substr(${p.date}, 1, 7)`, p.kind),
  ]);
  return buildPayroll(staff, accruals, payments);
}
