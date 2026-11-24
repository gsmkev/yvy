/**
 * Compras con orden, factura y recepción; venta de granos (contratos, entregas, liquidaciones); compra y venta de
 * hacienda.
 */

import { z } from "zod";
import { uuid } from "./internal";
import { ACTIVITIES, COST_CATEGORIES, isoDate, optText, minorAmount, currencySchema } from "./core";

// ---------- Compras: orden, factura y recepción ----------

/** Tope de líneas por compra. */
export const maxPurchaseLines = 20;

/** Línea de una compra: producto, cantidad y precio. */
export const purchaseLineInput = z
  .object({
    productId: uuid.nullish(),
    description: optText(200),
    /** Rubro del gasto (solo líneas sin producto); no puede ser una venta. */
    category: z.enum(COST_CATEGORIES).refine((c) => c !== "sale", "Una compra no puede ser una venta").nullish(),
    activity: z.enum(ACTIVITIES).nullish(),
    qty: z.number().positive().max(1_000_000_000),
    unitPrice: minorAmount,
    lot: optText(60),
    expiresOn: isoDate.nullish(),
  })
  .refine((l) => l.productId || (l.description && l.description.trim()), "Cada línea lleva un producto o una descripción");

/** Alta de una compra con sus líneas. */
export const purchaseInput = z.object({
  partyId: uuid.nullish(),
  farmId: uuid.nullish(),
  orderDate: isoDate,
  expectedDate: isoDate.nullish(),
  currency: currencySchema,
  note: optText(300),
  lines: z.array(purchaseLineInput).min(1).max(maxPurchaseLines),
});

/** Datos de la factura de una compra. */
export const purchaseInvoiceInput = z.object({
  invoiceNumber: z.string().trim().min(1).max(40),
  invoiceDate: isoDate,
  dueDate: isoDate.nullish(),
});

/** Recepción de una compra en un depósito. */
export const purchaseReceiveInput = z.object({
  warehouseId: uuid,
  date: isoDate,
  /** Cantidades recibidas, lote y vencimiento por línea; lo que no se manda se recibe completo. */
  lines: z
    .array(z.object({ lineId: uuid, qty: z.number().min(0).max(1_000_000_000).optional(), lot: optText(60), expiresOn: isoDate.nullish() }))
    .max(maxPurchaseLines)
    .optional(),
});

/** Importe de una línea en unidad menor: cantidad por precio unitario, redondeado. */
export const lineAmount = (qty: number, unitPrice: number): number => Math.round(qty * unitPrice);

/** Estado de una compra. */
export type PurchaseStatus = "ordered" | "invoiced" | "received" | "complete";
/** Estado derivado: con factura y recepción está completa; la factura y la recepción pueden llegar en cualquier orden. */
export const purchaseStatus = (p: { invoiceNumber: string | null; receivedAt: string | null }): PurchaseStatus =>
  p.invoiceNumber && p.receivedAt ? "complete" : p.receivedAt ? "received" : p.invoiceNumber ? "invoiced" : "ordered";

// ---------- Venta de granos: contratos, entregas y liquidaciones ----------

/** Alta o cambio de un contrato de venta de granos. */
export const grainContractInput = z.object({
  partyId: uuid.nullish(),
  number: optText(40),
  crop: z.string().trim().min(1).max(40),
  seasonId: uuid.nullish(),
  tons: z.number().positive().max(10_000_000),
  priceMinor: minorAmount.refine((n) => n > 0, "El precio tiene que ser mayor que cero"),
  currency: currencySchema,
  deliveryFrom: isoDate.nullish(),
  deliveryTo: isoDate.nullish(),
  note: optText(300),
});

/** Entrega de granos contra un contrato. */
export const grainDeliveryInput = z.object({
  contractId: uuid,
  date: isoDate,
  /** Toneladas netas entregadas. */
  tons: z.number().positive().max(10_000_000),
  /** La estancia sale del lote; sin lote y con varias estancias hay que indicarla. */
  farmId: uuid.nullish(),
  plotId: uuid.nullish(),
  ticket: optText(40),
  destination: optText(80),
  moisturePct: z.number().min(0).max(100).nullish(),
});

/** Liquidación de granos entregados. */
export const grainSettlementInput = z.object({
  contractId: uuid,
  number: optText(40),
  date: isoDate,
  tons: z.number().positive().max(10_000_000),
  /** Si no se manda, el precio del contrato. */
  priceMinor: minorAmount.nullish(),
  deductionsMinor: minorAmount.nullish(),
  farmId: uuid.nullish(),
  plotId: uuid.nullish(),
  dueDate: isoDate.nullish(),
});

/** Neto de una liquidación: toneladas por precio menos descuentos (nunca negativo). */
export const settlementNet = (tons: number, priceMinor: number, deductionsMinor: number): number =>
  Math.max(0, Math.round(tons * priceMinor) - deductionsMinor);

/** Avance de un contrato: lo entregado, lo liquidado y lo que falta de cada cosa. */
export function contractProgress(contractTons: number, deliveredTons: number, settledTons: number) {
  const q = (n: number) => Math.round(n * 1000) / 1000;
  return {
    deliveredTons: q(deliveredTons),
    settledTons: q(settledTons),
    toDeliverTons: q(Math.max(0, contractTons - deliveredTons)),
    toSettleTons: q(Math.max(0, deliveredTons - settledTons)),
  };
}

// ---------- Compras y ventas de hacienda ----------

/** Tipos de operación de hacienda: compra o venta. */
export const CATTLE_DEAL_KINDS = ["buy", "sell"] as const;
/** Tipo de operación de hacienda. */
export type CattleDealKind = (typeof CATTLE_DEAL_KINDS)[number];

/** Compra o venta de hacienda. */
export const cattleDealInput = z.object({
  kind: z.enum(CATTLE_DEAL_KINDS),
  date: isoDate,
  partyId: uuid.nullish(),
  farmId: uuid.nullish(),
  seasonId: uuid.nullish(),
  category: optText(60),
  heads: z.number().int().min(1).max(100_000),
  totalKg: z.number().positive().max(100_000_000),
  /** Importe total en unidad menor de la moneda. */
  amount: minorAmount.refine((n) => n > 0, "El importe tiene que ser mayor que cero"),
  currency: currencySchema,
  guideNumber: optText(40),
  dueDate: isoDate.nullish(),
  note: optText(300),
});

/** Precio por kilo vivo (en la unidad menor de la moneda) y kilos por cabeza. */
export const cattleFigures = (amount: number, totalKg: number, heads: number) => ({
  pricePerKg: totalKg > 0 ? Math.round((amount / totalKg) * 100) / 100 : null,
  kgPerHead: heads > 0 ? Math.round((totalKg / heads) * 10) / 10 : null,
});

/** Costo por kilo de carne vendida: costos de ganadería sobre kilos vendidos (guaraníes). Null sin kilos vendidos. */
export const costPerKgBeef = (livestockCostPyg: number, kgSold: number): number | null => (kgSold > 0 ? Math.round(livestockCostPyg / kgSold) : null);
