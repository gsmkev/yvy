/** Armado de las filas que dejan los efectos ERP: salidas de stock, costo de insumos y costo del contratista. */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { avgUnitCost, consumptionLines, localDate, moveValue, newId, orderSchema, toPyg, type StockTotals, type WorkOrder } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { usdRateOn } from "./erp";
import { inChunks, type EffectData, type EffectRecord } from "./erp-effects-data";
import type { ScopedDb } from "./scoped";
import { emptyTotals } from "./stock-moves";

type Move = typeof s.stockMoves.$inferInsert;
type Cost = typeof s.costEntries.$inferInsert;

const numOr = (v: unknown): number | null => (typeof v === "number" ? v : null);
const seasonOf = (r: EffectRecord) => (typeof r.data.seasonId === "string" ? r.data.seasonId : null);
const productNames = (r: EffectRecord) =>
  ((r.data.products as { name?: string }[] | undefined) ?? []).map((p) => p.name).filter(Boolean).join(", ");

/** Por tipo de registro: texto corto del costo (los productos), rubro y si es de ganadería. */
const KIND_EFFECTS: Record<string, { describe: (r: EffectRecord) => string; category: "fuel" | "input"; livestock: boolean }> = {
  health: { describe: (r) => String(r.data.product ?? ""), category: "input", livestock: true },
  fuel_load: { describe: (r) => String(r.data.machine ?? ""), category: "fuel", livestock: false },
  feed: { describe: (r) => String(r.data.ration ?? ""), category: "input", livestock: true },
};
const DEFAULT_EFFECT = { describe: productNames, category: "input" as const, livestock: false };

/** Salidas de stock (valorizadas al costo promedio, descontando lo que ya iba consumiendo este push) y un costo por registro. */
export function consumptionEntries(sdb: ScopedDb, recs: EffectRecord[], data: EffectData, running: Map<string, StockTotals>, now: number) {
  const org = sdb.auth.orgId;
  const moves: Move[] = [];
  const costs: Cost[] = [];
  for (const r of recs) {
    const warehouseId = data.warehouseOf.get(r.farmId);
    if (!warehouseId) continue; // sin depósito en la estancia no hay de dónde descontar
    const plot = r.plotId ? data.plots.get(r.plotId) : undefined;
    const lines = consumptionLines(r.kind, r.data, { plotAreaHa: plot?.areaHa ?? null, units: data.units, fuelProductId: data.fuelProductId });
    let total = 0;
    for (const l of lines) {
      const t = running.get(l.productId) ?? { ...emptyTotals };
      const value = moveValue(l.qty, avgUnitCost(t));
      t.qty -= l.qty;
      t.valuePyg -= value;
      running.set(l.productId, t);
      total += value;
      moves.push({
        id: newId(),
        organizationId: org,
        productId: l.productId,
        warehouseId,
        qty: -l.qty,
        valuePyg: -value,
        occurredAt: r.capturedAt,
        origin: "consumption",
        originId: r.id,
        createdBy: sdb.auth.userId,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (total <= 0) continue;
    const effect = KIND_EFFECTS[r.kind] ?? DEFAULT_EFFECT;
    costs.push({
      id: newId(),
      organizationId: org,
      occurredAt: r.capturedAt,
      farmId: r.farmId,
      plotId: r.plotId,
      seasonId: seasonOf(r),
      activity: effect.livestock || plot?.kind === "pasture" ? "ganaderia" : "agricultura",
      category: effect.category,
      description: effect.describe(r).slice(0, 200),
      amount: total,
      currency: "PYG",
      amountPyg: total,
      productId: lines.length === 1 ? lines[0]!.productId : null,
      origin: "consumption",
      originId: r.id,
      createdBy: sdb.auth.userId,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { moves, costs };
}

function parseOrders(orderTasks: EffectData["orderTasks"]): Map<string, WorkOrder> {
  const orders = new Map<string, WorkOrder>();
  for (const t of orderTasks) {
    try {
      const p = orderSchema.safeParse(JSON.parse(t.workOrder ?? "null"));
      if (p.success) orders.set(t.id, p.data);
    } catch {
      /* orden dañada: sin costo de contratista */
    }
  }
  return orders;
}

/** Cantidad que se le paga al contratista: por hectárea la superficie hecha; por tonelada lo cosechado; por hora las horas del registro. */
function contractorQty(c: { rateUnit: string }, r: EffectRecord, plotAreaHa: number | null): number | null {
  if (c.rateUnit === "ha") return typeof r.data.areaHa === "number" ? r.data.areaHa : plotAreaHa;
  return numOr(c.rateUnit === "ton" ? r.data.tons : r.data.hours);
}

/** Costo del contratista de la orden de trabajo, al cerrar el registro de siembra o cosecha. */
export async function contractorCosts(sdb: ScopedDb, recs: EffectRecord[], data: EffectData, now: number): Promise<Cost[]> {
  const org = sdb.auth.orgId;
  const orders = parseOrders(data.orderTasks);
  const contractorIds = [...new Set([...orders.values()].flatMap((o) => (o.contractorId ? [o.contractorId] : [])))];
  if (!contractorIds.length) return [];
  const contractors = await inChunks(contractorIds, (chunk) =>
    sdb.db
      .select()
      .from(s.contractors)
      .where(and(eq(s.contractors.organizationId, org), isNull(s.contractors.deletedAt), inArray(s.contractors.id, chunk))),
  );
  const contractorOf = new Map(contractors.map((c) => [c.id, c]));
  const rates = new Map<string, number | null>();
  const costs: Cost[] = [];
  for (const r of recs) {
    const order = typeof r.data.orderTaskId === "string" ? orders.get(r.data.orderTaskId) : undefined;
    const c = order?.contractorId ? contractorOf.get(order.contractorId) : undefined;
    if (!c) continue;
    const plot = r.plotId ? data.plots.get(r.plotId) : undefined;
    const qty = contractorQty(c, r, plot?.areaHa ?? null);
    if (!qty || qty <= 0) continue;
    const amount = Math.round(qty * c.rateAmount);
    const day = localDate(r.capturedAt);
    if (c.currency === "USD" && !rates.has(day)) rates.set(day, await usdRateOn(sdb, day));
    const pyg = toPyg(amount, c.currency, rates.get(day) ?? null);
    if (pyg === null) continue; // sin tipo de cambio no se inventa el costo
    costs.push({
      id: newId(),
      organizationId: org,
      occurredAt: r.capturedAt,
      farmId: r.farmId,
      plotId: r.plotId,
      seasonId: seasonOf(r),
      activity: plot?.kind === "pasture" ? "ganaderia" : "agricultura",
      category: "contractor",
      description: c.name,
      amount,
      currency: c.currency,
      amountPyg: pyg,
      partyId: c.partyId,
      origin: "contractor",
      originId: r.id,
      createdBy: sdb.auth.userId,
      createdAt: now,
      updatedAt: now,
    });
  }
  return costs;
}
