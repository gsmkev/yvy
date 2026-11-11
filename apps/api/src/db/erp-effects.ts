/**
 * Consumo automático (E-13): un registro de campo con productos del catálogo descuenta stock y carga costo.
 *
 * - Una aplicación o una fertilización consume dosis por hectárea x superficie hecha; un tratamiento sanitario,
 *   la cantidad que se anotó. Cada producto genera una salida de stock del depósito predeterminado de la estancia,
 *   valorizada al costo promedio ponderado; el registro genera una sola entrada de costo (al lote, con su campaña).
 * - Idempotente por registro: el id del registro es el `originId` de sus filas. Cada vez que el registro llega
 *   (de nuevo o editado) se revierten sus filas anteriores (borrado lógico) y se arman las nuevas; si el registro se
 *   borra, se revierten. El costo promedio que se usa descuenta antes las filas que se están reemplazando.
 * - Entra en el mismo db.batch() del push: o se guarda todo o nada. Si no entra en el presupuesto de consultas de la
 *   invocación se responde 503 y el cliente divide el envío (ver packages/sync).
 */
import { and, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { HTTPException } from "hono/http-exception";
import {
  avgUnitCost,
  CONSUMING_KINDS,
  consumptionLines,
  consumptionProductIds,
  LIMITS,
  moveValue,
  newId,
  orderSchema,
  toPyg,
  localDate,
  type BaseUnit,
  type WorkOrder,
  type StockTotals,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, currentVersion, type Stmt } from "./client";
import { usdRateOn } from "./erp";
import type { ScopedDb } from "./scoped";
import { emptyTotals, productTotals } from "./stock-moves";

export interface EffectRecord {
  id: string;
  farmId: string;
  plotId: string | null;
  kind: string;
  data: Record<string, unknown>;
  capturedAt: number;
}

export const consumes = (kind: string) => (CONSUMING_KINDS as readonly string[]).includes(kind);
/**
 * Registros con efectos en el ERP: los que consumen insumos y los que cierran una orden de trabajo y pueden
 * cargar el costo del contratista (siembra y cosecha). Se revisan todos para poder revertir si el registro cambia.
 */
export const hasEffects = (kind: string) => consumes(kind) || kind === "sowing" || kind === "harvest";

/**
 * Parámetros que ocupa una fila en un INSERT de drizzle: las columnas que se mandan más las omitidas que tienen valor
 * por defecto (las demás van como null literal). D1 admite 100 por consulta: se reparte en sentencias con este conteo.
 */
const rowParams = (table: SQLiteTable, row: Record<string, unknown>) =>
  Object.entries(getTableColumns(table)).filter(([key, col]) => row[key] !== undefined || col.hasDefault).length;
const insertChunks = <T extends Record<string, unknown>>(table: SQLiteTable, rows: T[]): T[][] =>
  rows.length ? chunkForParams(rows, Math.max(...rows.map((r) => rowParams(table, r)))) : [];

/**
 * Sentencias que dejan el stock y los costos de `upserts` (registros aceptados en este push) y de `deletedIds`
 * (registros borrados) al día. Devuelve [] sin tocar la base si no hay nada que hacer.
 */
export async function recordEffects(sdb: ScopedDb, upserts: EffectRecord[], deletedIds: string[]): Promise<Stmt[]> {
  const deleted = new Set(deletedIds);
  // El último gana por id; un registro que se borra en el mismo envío no deja efectos.
  const byId = new Map<string, EffectRecord>();
  for (const r of upserts) if (hasEffects(r.kind) && !deleted.has(r.id)) byId.set(r.id, r);
  const recs = [...byId.values()];
  if (!recs.length && !deletedIds.length) return [];

  const { db } = sdb;
  const org = sdb.auth.orgId;
  const now = sdb.now();
  const gone = { deletedAt: now, updatedAt: now };
  const stmts: Stmt[] = [];
  const reverse = (ids: string[]) => {
    for (const chunk of chunkForParams(ids, 2)) {
      stmts.push(
        db
          .update(s.stockMoves)
          .set(gone)
          .where(
            and(
              eq(s.stockMoves.organizationId, org),
              eq(s.stockMoves.origin, "consumption"),
              inArray(s.stockMoves.originId, chunk),
              isNull(s.stockMoves.deletedAt),
            ),
          ),
        db
          .update(s.costEntries)
          .set(gone)
          .where(
            and(
              eq(s.costEntries.organizationId, org),
              inArray(s.costEntries.originId, chunk),
              isNull(s.costEntries.deletedAt),
            ),
          ),
      );
    }
  };
  if (deletedIds.length) reverse(deletedIds);
  if (!recs.length) return stmts;

  // Horómetro u odómetro de las máquinas: queda la lectura más alta (la máquina baja al celular, es sincronizable).
  const meters = new Map<string, number>();
  for (const r of recs)
    if (r.kind === "fuel_load" && typeof r.data.machineId === "string" && typeof r.data.meterValue === "number")
      meters.set(r.data.machineId, Math.max(meters.get(r.data.machineId) ?? 0, r.data.meterValue));
  for (const [id, v] of meters)
    stmts.push(
      db
        .update(s.machines)
        .set({ meterValue: sql`MAX(${s.machines.meterValue}, ${v})`, updatedAt: now, version: currentVersion })
        .where(and(eq(s.machines.id, id), eq(s.machines.organizationId, org), isNull(s.machines.deletedAt))),
    );

  // ---------- Lecturas (en paralelo) ----------
  // Carga de combustible sin producto: se usa el único combustible del catálogo (si hay más de uno, no se adivina).
  let fuelProductId: string | null = null;
  if (recs.some((r) => r.kind === "fuel_load" && typeof r.data.productId !== "string")) {
    const fuels = await db
      .select({ id: s.products.id })
      .from(s.products)
      .where(and(eq(s.products.organizationId, org), eq(s.products.type, "fuel"), isNull(s.products.deletedAt)))
      .limit(2);
    if (fuels.length === 1) fuelProductId = fuels[0]!.id;
  }
  const productIds = [
    ...new Set([...(fuelProductId ? [fuelProductId] : []), ...recs.flatMap((r) => consumptionProductIds(r.kind, r.data))]),
  ];
  const plotIds = [...new Set(recs.flatMap((r) => (r.plotId ? [r.plotId] : [])))];
  const farmIds = [...new Set(recs.map((r) => r.farmId))];
  const recIds = recs.map((r) => r.id);
  const orderTaskIds = [...new Set(recs.flatMap((r) => (typeof r.data.orderTaskId === "string" ? [r.data.orderTaskId] : [])))];
  const [unitRows, plotRows, whRows, oldMoves, oldCosts, orderTasks, totals] = await Promise.all([
    Promise.all(
      chunkForParams(productIds, 2).map((chunk) =>
        db
          .select({ id: s.products.id, unit: s.products.unit })
          .from(s.products)
          .where(and(eq(s.products.organizationId, org), isNull(s.products.deletedAt), inArray(s.products.id, chunk))),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      chunkForParams(plotIds, 2).map((chunk) =>
        db
          .select({ id: s.plots.id, areaHa: s.plots.areaHa, kind: s.plots.kind })
          .from(s.plots)
          .where(and(eq(s.plots.organizationId, org), inArray(s.plots.id, chunk))),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      chunkForParams(farmIds, 2).map((chunk) =>
        db
          .select({ id: s.warehouses.id, farmId: s.warehouses.farmId, isDefault: s.warehouses.isDefault, createdAt: s.warehouses.createdAt })
          .from(s.warehouses)
          .where(and(eq(s.warehouses.organizationId, org), isNull(s.warehouses.deletedAt), inArray(s.warehouses.farmId, chunk))),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      chunkForParams(recIds, 2).map((chunk) =>
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
    ).then((r) => r.flat()),
    Promise.all(
      chunkForParams(recIds, 2).map((chunk) =>
        db
          .select({ originId: s.costEntries.originId })
          .from(s.costEntries)
          .where(and(eq(s.costEntries.organizationId, org), inArray(s.costEntries.originId, chunk), isNull(s.costEntries.deletedAt))),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      chunkForParams(orderTaskIds, 2).map((chunk) =>
        db
          .select({ id: s.tasks.id, workOrder: s.tasks.workOrder })
          .from(s.tasks)
          .where(and(eq(s.tasks.organizationId, org), isNull(s.tasks.deletedAt), inArray(s.tasks.id, chunk))),
      ),
    ).then((r) => r.flat()),
    productTotals(sdb, productIds),
  ]);

  // Lo que ya habían consumido estos registros se va a reemplazar: no cuenta para el costo promedio.
  const running = new Map<string, StockTotals>();
  for (const [id, t] of totals) running.set(id, { ...t });
  for (const m of oldMoves) {
    const t = running.get(m.productId);
    if (t) {
      t.qty -= m.qty;
      t.valuePyg -= m.valuePyg;
    }
  }
  const hadEffects = new Set([...oldMoves, ...oldCosts].map((m) => m.originId as string));
  reverse(recIds.filter((id) => hadEffects.has(id)));

  const units = new Map<string, BaseUnit>(unitRows.map((p) => [p.id, p.unit]));
  const plots = new Map(plotRows.map((p) => [p.id, p]));
  const warehouseOf = new Map<string, string>();
  for (const w of [...whRows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt - b.createdAt))
    if (!warehouseOf.has(w.farmId)) warehouseOf.set(w.farmId, w.id);

  // ---------- Armado ----------
  const moves: (typeof s.stockMoves.$inferInsert)[] = [];
  const costs: (typeof s.costEntries.$inferInsert)[] = [];
  for (const r of recs) {
    const warehouseId = warehouseOf.get(r.farmId);
    if (!warehouseId) continue; // sin depósito en la estancia no hay de dónde descontar
    const plot = r.plotId ? plots.get(r.plotId) : undefined;
    const lines = consumptionLines(r.kind, r.data, { plotAreaHa: plot?.areaHa ?? null, units, fuelProductId });
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
    if (total > 0)
      costs.push({
        id: newId(),
        organizationId: org,
        occurredAt: r.capturedAt,
        farmId: r.farmId,
        plotId: r.plotId,
        seasonId: typeof r.data.seasonId === "string" ? r.data.seasonId : null,
        activity: r.kind === "health" || plot?.kind === "pasture" ? "ganaderia" : "agricultura",
        category: r.kind === "fuel_load" ? "fuel" : "input",
        description: describe(r),
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

  // ---------- Costo del contratista de la orden de trabajo (E-21) ----------
  const orders = new Map<string, WorkOrder>();
  for (const t of orderTasks) {
    try {
      const p = orderSchema.safeParse(JSON.parse(t.workOrder ?? "null"));
      if (p.success) orders.set(t.id, p.data);
    } catch {
      /* orden dañada: sin costo de contratista */
    }
  }
  const contractorIds = [...new Set([...orders.values()].flatMap((o) => (o.contractorId ? [o.contractorId] : [])))];
  if (contractorIds.length) {
    const contractors = (
      await Promise.all(
        chunkForParams(contractorIds, 2).map((chunk) =>
          db
            .select()
            .from(s.contractors)
            .where(and(eq(s.contractors.organizationId, org), isNull(s.contractors.deletedAt), inArray(s.contractors.id, chunk))),
        ),
      )
    ).flat();
    const contractorOf = new Map(contractors.map((c) => [c.id, c]));
    const rates = new Map<string, number | null>();
    for (const r of recs) {
      const order = typeof r.data.orderTaskId === "string" ? orders.get(r.data.orderTaskId) : undefined;
      const c = order?.contractorId ? contractorOf.get(order.contractorId) : undefined;
      if (!c) continue;
      const plot = r.plotId ? plots.get(r.plotId) : undefined;
      const area = typeof r.data.areaHa === "number" ? r.data.areaHa : (plot?.areaHa ?? null);
      // Por hectárea: superficie hecha; por tonelada: lo cosechado; por hora: las horas del registro (si las trae).
      const qty =
        c.rateUnit === "ha" ? area : c.rateUnit === "ton" ? numOr(r.data.tons) : numOr(r.data.hours);
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
        seasonId: typeof r.data.seasonId === "string" ? r.data.seasonId : null,
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
  }

  if (moves.length > LIMITS.erp.maxEffectMovesPerPush)
    throw new HTTPException(503, { message: "Demasiados consumos en un solo envío: dividilo" });
  for (const chunk of insertChunks(s.stockMoves, moves)) stmts.push(db.insert(s.stockMoves).values(chunk));
  for (const chunk of insertChunks(s.costEntries, costs)) stmts.push(db.insert(s.costEntries).values(chunk));
  return stmts;
}

const numOr = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Texto corto del costo: los productos del registro. */
function describe(r: EffectRecord): string {
  if (r.kind === "health") return String(r.data.product ?? "").slice(0, 200);
  if (r.kind === "fuel_load") return String(r.data.machine ?? "").slice(0, 200);
  const names = ((r.data.products as { name?: string }[] | undefined) ?? []).map((p) => p.name).filter(Boolean);
  return names.join(", ").slice(0, 200);
}
