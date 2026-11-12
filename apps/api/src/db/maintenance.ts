/**
 * Mantenimiento preventivo y reparaciones de las máquinas (E-22).
 * Un servicio con costo carga un costo de maquinaria (categoría `machinery`) a la estancia de la máquina.
 * El agrónomo ve los planes y los avisos (son horas y kilómetros), nunca los montos.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { maintenanceStatus, newId, noonAsuncion, type Currency, type MaintenanceStatus } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch, type Stmt } from "./client";
import { pygOf } from "./costs";
import { requireOwned } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export interface DuePlan {
  planId: string;
  machineId: string;
  machine: string;
  name: string;
  meterKind: "hours" | "km";
  meter: number;
  dueAt: number;
  remaining: number;
  status: MaintenanceStatus;
}

/** Planes vencidos o por vencer (los que están bien no se listan salvo `all`). Dos consultas. */
export async function duePlans(sdb: ScopedDb, all = false): Promise<DuePlan[]> {
  sdb.require(can.viewStock);
  const org = sdb.auth.orgId;
  const [plans, machines] = await Promise.all([
    sdb.db
      .select()
      .from(s.maintenancePlans)
      .where(and(eq(s.maintenancePlans.organizationId, org), isNull(s.maintenancePlans.deletedAt))),
    sdb.db
      .select({ id: s.machines.id, name: s.machines.name, meterKind: s.machines.meterKind, meterValue: s.machines.meterValue })
      .from(s.machines)
      .where(and(eq(s.machines.organizationId, org), isNull(s.machines.deletedAt))),
  ]);
  const byId = new Map(machines.map((m) => [m.id, m]));
  const out: DuePlan[] = [];
  for (const p of plans) {
    const m = byId.get(p.machineId);
    if (!m) continue;
    const st = maintenanceStatus({ meter: m.meterValue, lastDoneMeter: p.lastDoneMeter, everyUnits: p.everyUnits });
    if (all || st.status !== "ok")
      out.push({ planId: p.id, machineId: m.id, machine: m.name, name: p.name, meterKind: m.meterKind, meter: m.meterValue, ...st });
  }
  return out.sort((a, b) => a.remaining - b.remaining);
}

export async function listLogs(sdb: ScopedDb, machineId?: string) {
  sdb.require(can.viewStock);
  const rows = await sdb.db
    .select()
    .from(s.maintenanceLogs)
    .where(
      and(
        eq(s.maintenanceLogs.organizationId, sdb.auth.orgId),
        isNull(s.maintenanceLogs.deletedAt),
        machineId ? eq(s.maintenanceLogs.machineId, machineId) : undefined,
      ),
    )
    .orderBy(desc(s.maintenanceLogs.occurredAt))
    .limit(200);
  return can.manageErp(sdb.auth.role) ? rows : rows.map((r) => ({ ...r, amount: undefined, currency: undefined, amountPyg: undefined }));
}

export async function createLog(
  sdb: ScopedDb,
  i: {
    machineId: string;
    planId?: string | null;
    kind: "preventive" | "repair";
    date: string;
    meterValue?: number | null;
    description?: string | null;
    partyId?: string | null;
    amount?: number | null;
    currency?: Currency | null;
  },
) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const [machine] = await sdb.db
    .select({ id: s.machines.id, name: s.machines.name, farmId: s.machines.farmId, meterValue: s.machines.meterValue })
    .from(s.machines)
    .where(and(eq(s.machines.id, i.machineId), eq(s.machines.organizationId, org), isNull(s.machines.deletedAt)))
    .limit(1);
  if (!machine) throw new NotFoundError("La máquina no existe");
  if (i.partyId) await requireOwned(sdb, s.parties, i.partyId, "El taller");
  if (i.planId) {
    const [plan] = await sdb.db
      .select({ machineId: s.maintenancePlans.machineId })
      .from(s.maintenancePlans)
      .where(and(eq(s.maintenancePlans.id, i.planId), eq(s.maintenancePlans.organizationId, org), isNull(s.maintenancePlans.deletedAt)))
      .limit(1);
    if (!plan) throw new NotFoundError("El plan no existe");
    if (plan.machineId !== i.machineId) throw new HTTPException(400, { message: "El plan es de otra máquina" });
  }
  const amount = i.amount ?? 0;
  if (amount > 0 && !i.currency) throw new HTTPException(400, { message: "Falta la moneda del costo" });
  const amountPyg = amount > 0 ? await pygOf(sdb, amount, i.currency as Currency, i.date) : null;
  const ts = sdb.now();
  const id = newId();
  const meter = i.meterValue ?? machine.meterValue;
  const occurredAt = noonAsuncion(i.date);
  const stmts: Stmt[] = [
    sdb.db.insert(s.maintenanceLogs).values({
      id,
      organizationId: org,
      machineId: i.machineId,
      planId: i.planId ?? null,
      kind: i.kind,
      occurredAt,
      meterValue: i.meterValue ?? null,
      description: i.description?.trim() || null,
      partyId: i.partyId ?? null,
      amount: amount > 0 ? amount : null,
      currency: amount > 0 ? i.currency : null,
      amountPyg,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    }),
  ];
  if (i.planId)
    stmts.push(
      sdb.db.update(s.maintenancePlans).set({ lastDoneMeter: meter, updatedAt: ts }).where(eq(s.maintenancePlans.id, i.planId)),
    );
  if (amountPyg !== null && amount > 0)
    stmts.push(
      sdb.db.insert(s.costEntries).values({
        id: newId(),
        organizationId: org,
        occurredAt,
        farmId: machine.farmId,
        activity: "administracion",
        category: "machinery",
        description: [machine.name, i.description?.trim()].filter(Boolean).join(": ").slice(0, 200),
        amount,
        currency: i.currency as Currency,
        amountPyg,
        partyId: i.partyId ?? null,
        origin: "maintenance",
        originId: id,
        createdBy: sdb.auth.userId,
        createdAt: ts,
        updatedAt: ts,
      }),
    );
  // Un servicio con lectura más alta adelanta el medidor de la máquina (baja al celular: sincronizable).
  if (i.meterValue !== undefined && i.meterValue !== null && i.meterValue > machine.meterValue)
    stmts.unshift(
      bumpVersion(sdb.db),
      sdb.db.update(s.machines).set({ meterValue: i.meterValue, updatedAt: ts, version: currentVersion }).where(eq(s.machines.id, machine.id)),
    );
  await runBatch(sdb.db, stmts);
  return { id };
}

export async function deleteLog(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const where = and(eq(s.maintenanceLogs.id, id), eq(s.maintenanceLogs.organizationId, org), isNull(s.maintenanceLogs.deletedAt));
  const [row] = await sdb.db.select({ id: s.maintenanceLogs.id }).from(s.maintenanceLogs).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  const ts = sdb.now();
  const gone = { deletedAt: ts, updatedAt: ts };
  await runBatch(sdb.db, [
    sdb.db.update(s.maintenanceLogs).set(gone).where(where),
    sdb.db
      .update(s.costEntries)
      .set(gone)
      .where(and(eq(s.costEntries.organizationId, org), eq(s.costEntries.origin, "maintenance"), eq(s.costEntries.originId, id))),
  ]);
}

