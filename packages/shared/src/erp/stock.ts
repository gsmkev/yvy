/** Depósitos, compras al stock, lotes y vencimientos, consumo automático desde registros de campo y stock mínimo. */

import { z } from "zod";
import type { DoseUnit } from "../agro";
import { uuid } from "./internal";
import { WAREHOUSE_TYPES, isoDate, optText, minorAmount, currencySchema } from "./core";

// ---------- Depósitos ----------

/** Alta o cambio de un depósito. */
export const warehouseInput = z.object({
  farmId: uuid,
  name: z.string().trim().min(1).max(80),
  type: z.enum(WAREHOUSE_TYPES),
  isDefault: z.boolean().optional(),
});

// ---------- Stock ----------

const stockQty = z.number().positive().max(1_000_000_000);
/** Compra de un producto a un depósito. */
export const stockPurchaseInput = z.object({
  productId: uuid,
  warehouseId: uuid,
  date: isoDate,
  qty: stockQty,
  /** Total del comprobante en unidad menor de `currency`. */
  amount: minorAmount,
  currency: currencySchema,
  partyId: uuid.nullish(),
  /** Lote y vencimiento del producto comprado. */
  lot: optText(40),
  expiresOn: isoDate.nullish(),
  note: optText(200),
});
/** Consumo manual; con `plotId` también carga el costo al lote. */
export const stockConsumptionInput = z.object({
  productId: uuid,
  warehouseId: uuid,
  date: isoDate,
  qty: stockQty,
  plotId: uuid.nullish(),
  seasonId: uuid.nullish(),
  note: optText(200),
});
/** Transferencia de stock entre dos depósitos. */
export const stockTransferInput = z.object({
  productId: uuid,
  fromWarehouseId: uuid,
  toWarehouseId: uuid,
  date: isoDate,
  qty: stockQty,
  note: optText(200),
});
/** Ajuste por recuento: positivo suma, negativo resta. */
export const stockAdjustmentInput = z.object({
  productId: uuid,
  warehouseId: uuid,
  date: isoDate,
  qty: z
    .number()
    .min(-1_000_000_000)
    .max(1_000_000_000)
    .refine((n) => n !== 0, "La cantidad no puede ser cero"),
  note: optText(200),
});

/** Suma de cantidades y valores de un producto, y el costo unitario de su última compra (para cuando no hay stock). */
export interface StockTotals {
  qty: number;
  valuePyg: number;
  lastUnitCost: number | null;
}

/**
 * Costo promedio ponderado por unidad (guaraníes por l o kg): valor del stock dividido por la cantidad.
 * Como las salidas se valorizan a este mismo costo, el cociente se mantiene entre movimientos.
 * Sin stock positivo (o sin valor) se usa el costo de la última compra, y si no hubo, 0.
 */
export function avgUnitCost(t: StockTotals): number {
  if (t.qty > 0 && t.valuePyg > 0) return t.valuePyg / t.qty;
  return t.lastUnitCost ?? 0;
}

/** Valor en guaraníes de mover `qty` unidades al costo promedio `avg` (siempre positivo). */
export const moveValue = (qty: number, avg: number): number => Math.round(Math.abs(qty) * avg);

// ---------- Lotes y vencimientos ----------

/** Lote comprado con su vencimiento y cantidad. */
export interface PurchaseLot {
  lot: string | null;
  expiresOn: string | null;
  qty: number;
}

/**
 * Lo que queda de cada lote comprado. Sin atribuir cada consumo a un lote, se asume que sale primero lo que vence
 * antes (FEFO) y al final lo que no tiene vencimiento. `stockQty` es el stock actual del producto: lo consumido
 * es lo comprado menos lo que hay. Devuelve los lotes con su `remaining` (0 si ya se consumió).
 */
export function lotsRemaining<T extends PurchaseLot>(lots: T[], stockQty: number): (T & { remaining: number })[] {
  let consumed = Math.max(0, lots.reduce((a, l) => a + l.qty, 0) - stockQty);
  const sorted = [...lots].sort((a, b) => (a.expiresOn ?? "9999-99-99").localeCompare(b.expiresOn ?? "9999-99-99"));
  return sorted.map((l) => {
    const take = Math.min(consumed, l.qty);
    consumed -= take;
    return { ...l, remaining: Math.round((l.qty - take) * 1000) / 1000 };
  });
}

/** Días de un día "YYYY-MM-DD" a otro (negativo si `to` ya pasó). */
export const daysUntil = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// ---------- Consumo automático desde los registros de campo ----------

/** Unidad base de stock: litros o kilos. */
export type BaseUnit = "l" | "kg";
/** Registros de campo que descuentan stock y cargan costo. */
export const CONSUMING_KINDS = ["application", "fertilization", "health", "fuel_load", "feed"] as const;

const DOSE_TO_BASE: Record<DoseUnit, { unit: BaseUnit; factor: number }> = {
  l_ha: { unit: "l", factor: 1 },
  ml_ha: { unit: "l", factor: 0.001 },
  kg_ha: { unit: "kg", factor: 1 },
  g_ha: { unit: "kg", factor: 0.001 },
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface DoseLike {
  productId?: string;
  dose: number;
  unit: DoseUnit;
  /** Cantidad total realmente usada, en la unidad de la dosis sin "/ha". */
  usedQty?: number;
}

/** Ids de catálogo que usa un registro (para leerlos de una vez). */
export function consumptionProductIds(kind: string, data: Record<string, unknown>): string[] {
  if (kind === "application" || kind === "fertilization")
    return ((data.products as DoseLike[] | undefined) ?? []).map((p) => p.productId).filter((x): x is string => !!x);
  if ((kind === "health" || kind === "fuel_load") && typeof data.productId === "string") return [data.productId];
  if (kind === "feed") return ((data.items as { productId?: string }[] | undefined) ?? []).map((i) => i.productId).filter((x): x is string => !!x);
  return [];
}

/**
 * Cantidades de insumos que consume un registro, en la unidad base del producto (l o kg).
 * - application y fertilization: dosis por hectárea x superficie hecha (`areaHa` del registro o, si falta, la del lote),
 *   o la cantidad real usada del producto (`usedQty`) si el operario la anotó al cerrar la orden.
 * - health: la cantidad del registro (`quantity`).
 * - fuel_load: los litros de la carga, del combustible indicado o del único combustible del catálogo.
 * Solo cuentan los productos del catálogo (`units`: id a unidad). Un producto cuya dosis no es de la misma familia que
 * su unidad (kg/ha para un líquido) o un registro sin superficie no consumen nada: no se inventa stock.
 * Un mismo producto repetido se suma.
 */
export function consumptionLines(
  kind: string,
  data: Record<string, unknown>,
  ctx: { plotAreaHa: number | null; units: Map<string, BaseUnit>; fuelProductId?: string | null },
): { productId: string; qty: number }[] {
  const acc = new Map<string, number>();
  const add = (id: string, qty: number) => {
    if (qty > 0) acc.set(id, (acc.get(id) ?? 0) + qty);
  };
  if (kind === "application" || kind === "fertilization") {
    const area = typeof data.areaHa === "number" ? data.areaHa : ctx.plotAreaHa;
    for (const p of (data.products as DoseLike[] | undefined) ?? []) {
      const unit = p.productId ? ctx.units.get(p.productId) : undefined;
      const conv = DOSE_TO_BASE[p.unit];
      if (!(p.productId && unit && conv && conv.unit === unit)) continue;
      // Con la cantidad real que anotó el operario no hace falta la superficie.
      if (typeof p.usedQty === "number" && p.usedQty > 0) add(p.productId, p.usedQty * conv.factor);
      else if (area && area > 0) add(p.productId, p.dose * conv.factor * area);
    }
  } else if (kind === "fuel_load") {
    // Litros de la carga; el producto es el indicado o, si no, el único combustible del catálogo.
    const id = typeof data.productId === "string" ? data.productId : ctx.fuelProductId;
    if (id && ctx.units.get(id) === "l" && typeof data.liters === "number") add(id, data.liters);
  } else if (kind === "feed") {
    // Ración: los kilos tal cual de cada ingrediente, solo de productos del catálogo medidos en kg.
    for (const i of (data.items as { productId?: string; kg?: number }[] | undefined) ?? [])
      if (i.productId && ctx.units.get(i.productId) === "kg" && typeof i.kg === "number") add(i.productId, i.kg);
  } else if (kind === "health") {
    const id = data.productId;
    if (typeof id === "string" && ctx.units.has(id) && typeof data.quantity === "number") add(id, data.quantity);
  }
  return [...acc].map(([productId, qty]) => ({ productId, qty: round3(qty) })).filter((l) => l.qty > 0);
}

// ---------- Stock mínimo ----------

/** Stock mínimo de un producto en un depósito. */
export const stockMinimumInput = z.object({
  productId: uuid,
  warehouseId: uuid,
  /** En la unidad base del producto. */
  minQty: z.number().min(0).max(1_000_000_000),
});

/** Producto por debajo de su stock mínimo. */
export interface LowStockRow {
  productId: string;
  warehouseId: string;
  qty: number;
  minQty: number;
  /** Lo que falta para llegar al mínimo. */
  missing: number;
}

/** Productos por debajo del mínimo (o justo en él) en su depósito: los de mayor faltante primero. Con 0 como mínimo no avisa. */
export function belowMinimum(
  stock: { productId: string; warehouseId: string; qty: number }[],
  minimums: { productId: string; warehouseId: string; minQty: number }[],
): LowStockRow[] {
  const have = new Map(stock.map((r) => [`${r.productId}|${r.warehouseId}`, r.qty]));
  const out: LowStockRow[] = [];
  for (const m of minimums) {
    if (m.minQty <= 0) continue;
    const qty = have.get(`${m.productId}|${m.warehouseId}`) ?? 0;
    if (qty <= m.minQty + 1e-9)
      out.push({
        productId: m.productId,
        warehouseId: m.warehouseId,
        qty,
        minQty: m.minQty,
        missing: Math.round((m.minQty - qty) * 1000) / 1000,
      });
  }
  return out.sort((a, b) => b.missing - a.missing);
}
