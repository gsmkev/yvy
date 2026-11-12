/**
 * ERP sencillo (ADR 0004): constantes, esquemas de entrada y cálculos puros (dinero, stock, costos).
 * Sin dependencias de la base: corre en el Worker, la web y las pruebas.
 *
 * Dinero: siempre enteros en la unidad menor de la moneda. PYG no tiene decimales (1 = un guaraní);
 * USD va en centavos. Todo costo guarda además su valor en guaraníes (`amountPyg`) con el tipo de cambio
 * del día, así los informes suman con una sola consulta.
 */
import { z } from "zod";
import type { DoseUnit } from "./agro";

export const CURRENCIES = ["PYG", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const ACTIVITIES = ["agricultura", "ganaderia", "administracion"] as const;
export type Activity = (typeof ACTIVITIES)[number];
export const PARTY_KINDS = ["supplier", "customer", "both"] as const;
export const MACHINE_TYPES = ["tractor", "sprayer", "harvester", "planter", "truck", "pickup", "other"] as const;
export const METER_KINDS = ["hours", "km"] as const;
export const CONTRACTOR_SERVICES = ["sowing", "spraying", "harvest", "freight", "other"] as const;
export const RATE_UNITS = ["ha", "hour", "ton"] as const;
export const WAREHOUSE_TYPES = ["shed", "tank", "silo"] as const;
export const STOCK_ORIGINS = ["purchase", "consumption", "transfer", "adjustment"] as const;
export type StockOrigin = (typeof STOCK_ORIGINS)[number];
/** `sale` es ingreso (venta); el resto son costos. */
export const COST_CATEGORIES = ["input", "fuel", "contractor", "labor", "machinery", "other", "sale"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

// ---------- Dinero ----------

const MINOR: Record<Currency, number> = { PYG: 1, USD: 100 };

/** De lo que se escribe (guaraníes o dólares con decimales) a la unidad menor entera. */
export const toMinor = (major: number, currency: Currency): number => Math.round(major * MINOR[currency]);
export const fromMinor = (minor: number, currency: Currency): number => minor / MINOR[currency];

/** Valor en guaraníes de un monto en `currency`. `usdToPyg` = guaraníes por dólar. */
export function toPyg(minor: number, currency: Currency, usdToPyg: number | null): number | null {
  if (currency === "PYG") return minor;
  if (!usdToPyg || usdToPyg <= 0) return null;
  return Math.round((minor / 100) * usdToPyg);
}

/**
 * Tipo de cambio para un día: el más reciente hasta ese día; si todos son posteriores, el más antiguo.
 * Sin ninguno devuelve null. `rates` en cualquier orden.
 */
export function rateOn(rates: { date: string; usdToPyg: number }[], day: string): number | null {
  if (!rates.length) return null;
  let best: { date: string; usdToPyg: number } | null = null;
  let oldest = rates[0]!;
  for (const r of rates) {
    if (r.date < oldest.date) oldest = r;
    if (r.date <= day && (!best || r.date > best.date)) best = r;
  }
  return (best ?? oldest).usdToPyg;
}

// ---------- Esquemas de entrada ----------

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Texto opcional: la API pasa "" a null antes de guardar (cleanRow), así un PATCH no pisa lo que no manda. */
export const optText = (max: number) => z.string().trim().max(max).nullish();

/** Monto en unidad menor: entero no negativo. */
export const minorAmount = z.number().int().min(0).max(1_000_000_000_000);

export const currencySchema = z.enum(CURRENCIES);
export const exchangeRateInput = z.object({
  date: isoDate,
  /** Guaraníes por dólar (entero). */
  usdToPyg: z.number().int().min(1).max(100_000),
});

// ---------- Maquinaria (E-03) ----------

export const machineInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(MACHINE_TYPES),
  brand: optText(60),
  model: optText(60),
  year: z.number().int().min(1950).max(2100).nullish(),
  meterKind: z.enum(METER_KINDS),
  meterValue: z.number().min(0).max(10_000_000).nullish(),
  farmId: z.string().uuid().nullish(),
});

// ---------- Contratistas (E-04) ----------

export const contractorInput = z.object({
  name: z.string().trim().min(1).max(120),
  partyId: z.string().uuid().nullish(),
  service: z.enum(CONTRACTOR_SERVICES),
  rateUnit: z.enum(RATE_UNITS),
  /** Tarifa en unidad menor de `currency`. */
  rateAmount: minorAmount,
  currency: currencySchema,
  note: optText(300),
});

// ---------- Costos y ventas (E-05) ----------

const uuid = z.string().uuid();
/** Alta o cambio de un costo o una venta manual. La API calcula `amountPyg` con el tipo de cambio de la fecha. */
export const costEntryInput = z.object({
  date: isoDate,
  farmId: uuid.nullish(),
  plotId: uuid.nullish(),
  seasonId: uuid.nullish(),
  activity: z.enum(ACTIVITIES),
  category: z.enum(COST_CATEGORIES),
  description: optText(200),
  amount: minorAmount.refine((n) => n > 0, "El monto tiene que ser mayor que cero"),
  currency: currencySchema,
  partyId: uuid.nullish(),
  /** Solo ventas. */
  tons: z.number().positive().max(1_000_000).nullish(),
});

/** Mediodía de Asunción (UTC-3) de un día "YYYY-MM-DD", en epoch ms. */
export const noonAsuncion = (day: string): number => Date.parse(`${day}T12:00:00-03:00`);

// ---------- Depósitos (E-10) ----------

export const warehouseInput = z.object({
  farmId: uuid,
  name: z.string().trim().min(1).max(80),
  type: z.enum(WAREHOUSE_TYPES),
  isDefault: z.boolean().optional(),
});

// ---------- Stock (E-11) ----------

const stockQty = z.number().positive().max(1_000_000_000);
export const stockPurchaseInput = z.object({
  productId: uuid,
  warehouseId: uuid,
  date: isoDate,
  qty: stockQty,
  /** Total del comprobante en unidad menor de `currency`. */
  amount: minorAmount,
  currency: currencySchema,
  partyId: uuid.nullish(),
  /** Lote y vencimiento del producto comprado (E-12). */
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

// ---------- Lotes y vencimientos (E-12) ----------

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

// ---------- Consumo automático desde los registros de campo (E-13) ----------

export type BaseUnit = "l" | "kg";
/** Registros de campo que descuentan stock y cargan costo. */
export const CONSUMING_KINDS = ["application", "fertilization", "health", "fuel_load"] as const;

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
}

/** Ids de catálogo que usa un registro (para leerlos de una vez). */
export function consumptionProductIds(kind: string, data: Record<string, unknown>): string[] {
  if (kind === "application" || kind === "fertilization")
    return ((data.products as DoseLike[] | undefined) ?? []).map((p) => p.productId).filter((x): x is string => !!x);
  if ((kind === "health" || kind === "fuel_load") && typeof data.productId === "string") return [data.productId];
  return [];
}

/**
 * Cantidades de insumos que consume un registro, en la unidad base del producto (l o kg).
 * - application y fertilization: dosis por hectárea x superficie hecha (`areaHa` del registro o, si falta, la del lote).
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
    if (!area || area <= 0) return [];
    for (const p of (data.products as DoseLike[] | undefined) ?? []) {
      const unit = p.productId ? ctx.units.get(p.productId) : undefined;
      const conv = DOSE_TO_BASE[p.unit];
      if (p.productId && unit && conv && conv.unit === unit) add(p.productId, p.dose * conv.factor * area);
    }
  } else if (kind === "fuel_load") {
    // Litros de la carga; el producto es el indicado o, si no, el único combustible del catálogo.
    const id = typeof data.productId === "string" ? data.productId : ctx.fuelProductId;
    if (id && ctx.units.get(id) === "l" && typeof data.liters === "number") add(id, data.liters);
  } else if (kind === "health") {
    const id = data.productId;
    if (typeof id === "string" && ctx.units.has(id) && typeof data.quantity === "number") add(id, data.quantity);
  }
  return [...acc].map(([productId, qty]) => ({ productId, qty: round3(qty) })).filter((l) => l.qty > 0);
}

// ---------- Costo y margen (E-30, E-31) ----------

export interface ResultInput {
  costPyg: number;
  incomePyg: number;
  areaHa: number;
  tons: number;
}
export interface ResultFigures {
  marginPyg: number;
  /** Guaraníes por hectárea; null sin superficie. */
  costPerHa: number | null;
  marginPerHa: number | null;
  /** Guaraníes por tonelada cosechada; null sin cosecha. */
  costPerTon: number | null;
}

/** Costo por hectárea y por tonelada y margen bruto (ventas menos costos). Redondeado al guaraní. */
export function resultFigures(r: ResultInput): ResultFigures {
  const marginPyg = r.incomePyg - r.costPyg;
  return {
    marginPyg,
    costPerHa: r.areaHa > 0 ? Math.round(r.costPyg / r.areaHa) : null,
    marginPerHa: r.areaHa > 0 ? Math.round(marginPyg / r.areaHa) : null,
    costPerTon: r.tons > 0 ? Math.round(r.costPyg / r.tons) : null,
  };
}

// ---------- Terceros (E-02) ----------

/** RUC (con dígito verificador) o cédula: solo dígitos y un guion final opcional. */
const ruc = z
  .string()
  .trim()
  .regex(/^\d{3,9}(-\d)?$/, "RUC o cédula inválidos (ej. 80012345-6)");

export const partyInput = z.object({
  name: z.string().trim().min(1).max(120),
  ruc: ruc.nullish(),
  kind: z.enum(PARTY_KINDS),
  phone: optText(40),
  email: optText(120),
  address: optText(200),
  note: optText(500),
});

// ---------- Stock mínimo (E-14) ----------

export const stockMinimumInput = z.object({
  productId: uuid,
  warehouseId: uuid,
  /** En la unidad base del producto. */
  minQty: z.number().min(0).max(1_000_000_000),
});

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
    if (qty <= m.minQty + 1e-9) out.push({ productId: m.productId, warehouseId: m.warehouseId, qty, minQty: m.minQty, missing: Math.round((m.minQty - qty) * 1000) / 1000 });
  }
  return out.sort((a, b) => b.missing - a.missing);
}

// ---------- Mantenimiento preventivo (E-22) ----------

export const MAINTENANCE_KINDS = ["preventive", "repair"] as const;
export type MaintenanceStatus = "ok" | "soon" | "overdue";
/** Se avisa cuando falta esta fracción del intervalo (o menos) para el próximo servicio. */
export const MAINTENANCE_WARN_FRACTION = 0.1;

export const maintenancePlanInput = z.object({
  machineId: uuid,
  name: z.string().trim().min(1).max(80),
  everyUnits: z.number().positive().max(1_000_000),
  /** Lectura del medidor en el último servicio (0 si es nueva). */
  lastDoneMeter: z.number().min(0).max(10_000_000).nullish(),
});

export const maintenanceLogInput = z.object({
  machineId: uuid,
  /** Si es un servicio de un plan, el plan vuelve a contar desde `meterValue`. */
  planId: uuid.nullish(),
  kind: z.enum(MAINTENANCE_KINDS),
  date: isoDate,
  meterValue: z.number().min(0).max(10_000_000).nullish(),
  description: optText(300),
  partyId: uuid.nullish(),
  amount: minorAmount.nullish(),
  currency: currencySchema.nullish(),
});

/** Cuánto falta (en horas o km) para el próximo servicio y en qué estado está. Negativo = vencido. */
export function maintenanceStatus(p: { meter: number; lastDoneMeter: number; everyUnits: number }): {
  dueAt: number;
  remaining: number;
  status: MaintenanceStatus;
} {
  const dueAt = p.lastDoneMeter + p.everyUnits;
  const remaining = Math.round((dueAt - p.meter) * 100) / 100;
  const status: MaintenanceStatus = remaining <= 0 ? "overdue" : remaining <= p.everyUnits * MAINTENANCE_WARN_FRACTION ? "soon" : "ok";
  return { dueAt, remaining, status };
}

// ---------- Costo de labor propia frente a contratista (E-23) ----------

export const machineCostInput = z.object({
  service: z.enum(CONTRACTOR_SERVICES),
  purchasePricePyg: minorAmount,
  residualPyg: minorAmount,
  lifeHours: z.number().min(0).max(1_000_000),
  operatorPerHourPyg: minorAmount,
  haPerHour: z.number().positive().max(10_000).nullish(),
  fuelLitersPerHour: z.number().positive().max(10_000).nullish(),
  fuelPricePyg: minorAmount.nullish(),
});

export interface OwnCostInput {
  fuelLitersPerHour: number | null;
  fuelPricePyg: number | null;
  operatorPerHourPyg: number;
  purchasePricePyg: number;
  residualPyg: number;
  lifeHours: number;
  haPerHour: number | null;
}
export interface OwnCost {
  fuelPerHour: number;
  operatorPerHour: number;
  depreciationPerHour: number;
  totalPerHour: number;
  /** Por hectárea; null si no se conoce el rendimiento. */
  perHa: number | null;
}

/** Costo propio por hora: combustible + operario + amortización lineal ((compra - reventa) / vida útil). Guaraníes enteros. */
export function ownLaborCost(i: OwnCostInput): OwnCost {
  const fuelPerHour = Math.round((i.fuelLitersPerHour ?? 0) * (i.fuelPricePyg ?? 0));
  const depreciationPerHour = i.lifeHours > 0 ? Math.round(Math.max(0, i.purchasePricePyg - i.residualPyg) / i.lifeHours) : 0;
  const totalPerHour = fuelPerHour + i.operatorPerHourPyg + depreciationPerHour;
  return {
    fuelPerHour,
    operatorPerHour: i.operatorPerHourPyg,
    depreciationPerHour,
    totalPerHour,
    perHa: i.haPerHour && i.haPerHour > 0 ? Math.round(totalPerHour / i.haPerHour) : null,
  };
}

/** Tarifa de un contratista llevada a guaraníes por hectárea o por hora (por tonelada no es comparable: null). */
export function contractorRatePer(
  unit: (typeof RATE_UNITS)[number],
  ratePyg: number,
  haPerHour: number | null,
): { perHa: number | null; perHour: number | null } {
  if (unit === "ha") return { perHa: ratePyg, perHour: haPerHour ? Math.round(ratePyg * haPerHour) : null };
  if (unit === "hour") return { perHa: haPerHour ? Math.round(ratePyg / haPerHour) : null, perHour: ratePyg };
  return { perHa: null, perHour: null };
}

/** Quién conviene: compara por hectárea si ambos la tienen y si no por hora. `savingPyg` > 0 = lo propio es más barato. */
export function laborVerdict(own: OwnCost, contractorPerHa: number | null, contractorPerHour: number | null) {
  if (own.perHa !== null && contractorPerHa !== null)
    return { basis: "ha" as const, savingPyg: contractorPerHa - own.perHa, cheaper: own.perHa <= contractorPerHa ? ("own" as const) : ("contractor" as const) };
  if (contractorPerHour !== null)
    return {
      basis: "hour" as const,
      savingPyg: contractorPerHour - own.totalPerHour,
      cheaper: own.totalPerHour <= contractorPerHour ? ("own" as const) : ("contractor" as const),
    };
  return null;
}
