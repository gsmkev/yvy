/** Lecturas de los efectos ERP de un push: productos, lotes, depósitos, filas anteriores y órdenes (en paralelo). */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { consumptionProductIds, type BaseUnit, type StockTotals } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams } from "./client";
import type { EffectRecord } from "./erp-effects";
import type { ScopedDb } from "./scoped";
import { productTotals } from "./stock-moves";

/** Una consulta por tanda de ids (≤ 100 parámetros), resultados juntos. */
export const inChunks = <T>(ids: string[], query: (chunk: string[]) => PromiseLike<T[]>): Promise<T[]> =>
  Promise.all(chunkForParams(ids, 2).map(query)).then((r) => r.flat());

export interface EffectData {
  fuelProductId: string | null;
  units: Map<string, BaseUnit>;
  plots: Map<string, { id: string; areaHa: number; kind: string }>;
  /** Depósito del que se descuenta en cada estancia: el predeterminado, o el más antiguo. */
  warehouseOf: Map<string, string>;
  oldMoves: { originId: string | null; productId: string; qty: number; valuePyg: number }[];
  oldCosts: { originId: string | null }[];
  orderTasks: { id: string; workOrder: string | null }[];
  totals: Map<string, StockTotals>;
}

/** Carga de combustible sin producto: se usa el único combustible del catálogo (si hay más de uno, no se adivina). */
async function singleFuelProduct(sdb: ScopedDb, recs: EffectRecord[]): Promise<string | null> {
  if (!recs.some((r) => r.kind === "fuel_load" && typeof r.data.productId !== "string")) return null;
  const fuels = await sdb.db
    .select({ id: s.products.id })
    .from(s.products)
    .where(and(eq(s.products.organizationId, sdb.auth.orgId), eq(s.products.type, "fuel"), isNull(s.products.deletedAt)))
    .limit(2);
  return fuels.length === 1 ? fuels[0]!.id : null;
}

export async function readEffectData(sdb: ScopedDb, recs: EffectRecord[]): Promise<EffectData> {
  const { db } = sdb;
  const org = sdb.auth.orgId;
  const fuelProductId = await singleFuelProduct(sdb, recs);
  const productIds = [
    ...new Set([...(fuelProductId ? [fuelProductId] : []), ...recs.flatMap((r) => consumptionProductIds(r.kind, r.data))]),
  ];
  const plotIds = [...new Set(recs.flatMap((r) => (r.plotId ? [r.plotId] : [])))];
  const farmIds = [...new Set(recs.map((r) => r.farmId))];
  const recIds = recs.map((r) => r.id);
  const orderTaskIds = [...new Set(recs.flatMap((r) => (typeof r.data.orderTaskId === "string" ? [r.data.orderTaskId] : [])))];
  const [unitRows, plotRows, whRows, oldMoves, oldCosts, orderTasks, totals] = await Promise.all([
    inChunks(productIds, (chunk) =>
      db
        .select({ id: s.products.id, unit: s.products.unit })
        .from(s.products)
        .where(and(eq(s.products.organizationId, org), isNull(s.products.deletedAt), inArray(s.products.id, chunk))),
    ),
    inChunks(plotIds, (chunk) =>
      db
        .select({ id: s.plots.id, areaHa: s.plots.areaHa, kind: s.plots.kind })
        .from(s.plots)
        .where(and(eq(s.plots.organizationId, org), inArray(s.plots.id, chunk))),
    ),
    inChunks(farmIds, (chunk) =>
      db
        .select({ id: s.warehouses.id, farmId: s.warehouses.farmId, isDefault: s.warehouses.isDefault, createdAt: s.warehouses.createdAt })
        .from(s.warehouses)
        .where(and(eq(s.warehouses.organizationId, org), isNull(s.warehouses.deletedAt), inArray(s.warehouses.farmId, chunk))),
    ),
    inChunks(recIds, (chunk) =>
      db
        .select({ originId: s.stockMoves.originId, productId: s.stockMoves.productId, qty: s.stockMoves.qty, valuePyg: s.stockMoves.valuePyg })
        .from(s.stockMoves)
        .where(
          and(
            eq(s.stockMoves.organizationId, org),
            eq(s.stockMoves.origin, "consumption"),
            inArray(s.stockMoves.originId, chunk),
            isNull(s.stockMoves.deletedAt),
          ),
        ),
    ),
    inChunks(recIds, (chunk) =>
      db
        .select({ originId: s.costEntries.originId })
        .from(s.costEntries)
        .where(and(eq(s.costEntries.organizationId, org), inArray(s.costEntries.originId, chunk), isNull(s.costEntries.deletedAt))),
    ),
    inChunks(orderTaskIds, (chunk) =>
      db
        .select({ id: s.tasks.id, workOrder: s.tasks.workOrder })
        .from(s.tasks)
        .where(and(eq(s.tasks.organizationId, org), isNull(s.tasks.deletedAt), inArray(s.tasks.id, chunk))),
    ),
    productTotals(sdb, productIds),
  ]);
  const warehouseOf = new Map<string, string>();
  for (const w of [...whRows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt - b.createdAt))
    if (!warehouseOf.has(w.farmId)) warehouseOf.set(w.farmId, w.id);
  return {
    fuelProductId,
    units: new Map(unitRows.map((p) => [p.id, p.unit])),
    plots: new Map(plotRows.map((p) => [p.id, p])),
    warehouseOf,
    oldMoves,
    oldCosts,
    orderTasks,
    totals,
  };
}
