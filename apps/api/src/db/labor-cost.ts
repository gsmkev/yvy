/**
 * Costo de la labor propia (combustible + operario + amortización) frente al contratista del mismo servicio (E-23).
 * Solo dueño y administrador: son montos. Cinco consultas como mucho.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { contractorRatePer, laborVerdict, newId, ownLaborCost, toPyg, localDate, type OwnCost } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { fuelReport } from "./fuel";
import { requireOwned, usdRateOn } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";

type Input = Omit<typeof s.machineCosts.$inferInsert, "id" | "organizationId" | "machineId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">;

export async function listMachineCosts(sdb: ScopedDb) {
  sdb.require(can.manageErp);
  return sdb.db
    .select()
    .from(s.machineCosts)
    .where(and(eq(s.machineCosts.organizationId, sdb.auth.orgId), isNull(s.machineCosts.deletedAt)));
}

export async function saveMachineCost(sdb: ScopedDb, machineId: string, i: Input) {
  sdb.require(can.manageErp);
  await requireOwned(sdb, s.machines, machineId, "La máquina");
  const ts = sdb.now();
  const values = { ...i, haPerHour: i.haPerHour ?? null, fuelLitersPerHour: i.fuelLitersPerHour ?? null, fuelPricePyg: i.fuelPricePyg ?? null };
  await sdb.db
    .insert(s.machineCosts)
    .values({ id: newId(), organizationId: sdb.auth.orgId, machineId, ...values, createdBy: sdb.auth.userId, createdAt: ts, updatedAt: ts })
    .onConflictDoUpdate({
      target: [s.machineCosts.organizationId, s.machineCosts.machineId],
      set: { ...values, updatedAt: ts, deletedAt: null },
    });
}

export async function deleteMachineCost(sdb: ScopedDb, machineId: string) {
  sdb.require(can.manageErp);
  const where = and(eq(s.machineCosts.organizationId, sdb.auth.orgId), eq(s.machineCosts.machineId, machineId));
  const [row] = await sdb.db.select({ id: s.machineCosts.id }).from(s.machineCosts).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  await sdb.db.delete(s.machineCosts).where(where);
}

export interface LaborRow {
  machineId: string;
  machine: string;
  service: string;
  own: OwnCost;
  fuelLitersPerHour: number | null;
  fuelPricePyg: number | null;
  /** Contratista más barato del mismo servicio (por la misma base de comparación). */
  contractor: { id: string; name: string; perHa: number | null; perHour: number | null } | null;
  verdict: ReturnType<typeof laborVerdict>;
}

export async function laborComparison(sdb: ScopedDb): Promise<LaborRow[]> {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const [profiles, machines, contractors, fuel, report] = await Promise.all([
    listMachineCosts(sdb),
    sdb.db
      .select({ id: s.machines.id, name: s.machines.name, meterKind: s.machines.meterKind })
      .from(s.machines)
      .where(and(eq(s.machines.organizationId, org), isNull(s.machines.deletedAt))),
    sdb.db
      .select()
      .from(s.contractors)
      .where(and(eq(s.contractors.organizationId, org), isNull(s.contractors.deletedAt))),
    sdb.db
      .select({ id: s.products.id })
      .from(s.products)
      .where(and(eq(s.products.organizationId, org), eq(s.products.type, "fuel"), isNull(s.products.deletedAt))),
    fuelReport(sdb, {}),
  ]);
  // Costo del litro: valor / cantidad de las compras de combustible.
  let stockPrice: number | null = null;
  if (fuel.length && fuel.length <= 90) {
    const [r] = await sdb.db
      .select({ qty: sql<number>`COALESCE(SUM(${s.stockMoves.qty}), 0)`, value: sql<number>`COALESCE(SUM(${s.stockMoves.valuePyg}), 0)` })
      .from(s.stockMoves)
      .where(
        and(
          eq(s.stockMoves.organizationId, org),
          isNull(s.stockMoves.deletedAt),
          inArray(s.stockMoves.productId, fuel.map((f) => f.id)),
        ),
      );
    if (r && r.qty > 0) stockPrice = Math.round(r.value / r.qty);
  }
  const needsUsd = contractors.some((c) => c.currency === "USD");
  const usd = needsUsd ? await usdRateOn(sdb, localDate(sdb.now())) : null;
  const byMachine = new Map(machines.map((m) => [m.id, m]));
  const litersPerHour = new Map(report.filter((r) => r.machineId && r.meterKind === "hours").map((r) => [r.machineId as string, r.litersPerUnit]));
  const out: LaborRow[] = [];
  for (const p of profiles) {
    const m = byMachine.get(p.machineId);
    if (!m) continue;
    const fuelLitersPerHour = p.fuelLitersPerHour ?? litersPerHour.get(m.id) ?? null;
    const fuelPricePyg = p.fuelPricePyg ?? stockPrice;
    const own = ownLaborCost({
      fuelLitersPerHour,
      fuelPricePyg,
      operatorPerHourPyg: p.operatorPerHourPyg,
      purchasePricePyg: p.purchasePricePyg,
      residualPyg: p.residualPyg,
      lifeHours: p.lifeHours,
      haPerHour: p.haPerHour,
    });
    let best: LaborRow["contractor"] = null;
    for (const c of contractors) {
      if (c.service !== p.service) continue;
      const pyg = toPyg(c.rateAmount, c.currency, usd);
      if (pyg === null) continue;
      const r = contractorRatePer(c.rateUnit, pyg, p.haPerHour);
      const key = (x: { perHa: number | null; perHour: number | null }) => x.perHa ?? x.perHour ?? Infinity;
      if (key(r) === Infinity) continue;
      if (!best || key(r) < key(best)) best = { id: c.id, name: c.name, ...r };
    }
    out.push({
      machineId: m.id,
      machine: m.name,
      service: p.service,
      own,
      fuelLitersPerHour,
      fuelPricePyg,
      contractor: best,
      verdict: best ? laborVerdict(own, best.perHa, best.perHour) : null,
    });
  }
  return out;
}
