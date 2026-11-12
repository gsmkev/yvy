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
  /** Cantidad total realmente usada (E-21), en la unidad de la dosis sin "/ha". */
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
 *   o la cantidad real usada del producto (`usedQty`) si el operario la anotó al cerrar la orden (E-21).
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
      // Con la cantidad real que anotó el operario (E-21) no hace falta la superficie.
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
  const status: MaintenanceStatus =
    remaining <= 0 ? "overdue" : remaining <= p.everyUnits * MAINTENANCE_WARN_FRACTION ? "soon" : "ok";
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
  const depreciationPerHour =
    i.lifeHours > 0 ? Math.round(Math.max(0, i.purchasePricePyg - i.residualPyg) / i.lifeHours) : 0;
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
    return {
      basis: "ha" as const,
      savingPyg: contractorPerHa - own.perHa,
      cheaper: own.perHa <= contractorPerHa ? ("own" as const) : ("contractor" as const),
    };
  if (contractorPerHour !== null)
    return {
      basis: "hour" as const,
      savingPyg: contractorPerHour - own.totalPerHour,
      cheaper: own.totalPerHour <= contractorPerHour ? ("own" as const) : ("contractor" as const),
    };
  return null;
}

// ---------- Personal y asistencia (E-25) ----------

export const employeeInput = z.object({
  name: z.string().trim().min(1).max(120),
  ci: optText(30),
  phone: optText(40),
  dailyWagePyg: minorAmount,
  userId: z.string().min(1).max(64).nullish(),
  note: optText(300),
});

export const ATTENDANCE_DAYS = [1, 0.5] as const;
export const maxAttendanceEntriesPerCall = 30;

export const attendanceEntry = z.object({
  employeeId: uuid,
  /** Día completo o medio día. */
  days: z.union([z.literal(1), z.literal(0.5)]),
  farmId: uuid.nullish(),
  plotId: uuid.nullish(),
  seasonId: uuid.nullish(),
  labor: optText(120),
  /** Jornal del día si no es el vigente del empleado. */
  wagePyg: minorAmount.nullish(),
});
export const attendanceDayInput = z.object({
  date: isoDate,
  entries: z.array(attendanceEntry).min(1).max(maxAttendanceEntriesPerCall),
});

/** Jornal por los días trabajados, en guaraníes enteros. */
export const wageFor = (dailyWagePyg: number, days: number): number => Math.round(dailyWagePyg * days);

// ---------- Adelantos, pagos y saldo por empleado (E-26) ----------

export const EMPLOYEE_PAYMENT_KINDS = ["advance", "payment"] as const;
export type EmployeePaymentKind = (typeof EMPLOYEE_PAYMENT_KINDS)[number];

export const employeePaymentInput = z.object({
  employeeId: uuid,
  date: isoDate,
  kind: z.enum(EMPLOYEE_PAYMENT_KINDS),
  amountPyg: minorAmount.refine((n) => n > 0, "El monto tiene que ser mayor que cero"),
  note: optText(200),
});

/** Saldo = devengado - adelantos - pagos. Positivo: se le debe al empleado; negativo: tiene adelantos de más. */
export const employeeBalance = (accruedPyg: number, advancesPyg: number, paymentsPyg: number): number =>
  accruedPyg - advancesPyg - paymentsPyg;

export interface StatementLine {
  date: string;
  kind: "wage" | EmployeePaymentKind;
  /** Con signo: el jornal suma, los adelantos y pagos restan. */
  amountPyg: number;
  note: string | null;
  id: string;
}

/** Cuenta corriente: líneas por fecha (a igual fecha, primero el jornal) con el saldo acumulado. */
export function statement(lines: StatementLine[]): (StatementLine & { balancePyg: number })[] {
  const order = (l: StatementLine) => (l.kind === "wage" ? 0 : 1);
  let bal = 0;
  return [...lines]
    .sort((a, b) => a.date.localeCompare(b.date) || order(a) - order(b) || a.id.localeCompare(b.id))
    .map((l) => ({ ...l, balancePyg: (bal += l.amountPyg) }));
}

// ---------- Presupuesto de campaña (E-32) ----------

/** Un lote o un cultivo, no los dos: la API deja solo el que se mandó (ver normalize en la ruta). */
export const budgetLineInput = z.object({
  seasonId: uuid,
  plotId: uuid.nullish(),
  crop: z.string().trim().min(1).max(40).nullish(),
  activity: z.enum(ACTIVITIES).nullish(),
  category: z.enum(COST_CATEGORIES),
  amountPyg: minorAmount.refine((n) => n > 0, "El monto tiene que ser mayor que cero"),
  note: optText(200),
});

export interface BudgetLine {
  id: string;
  plotId: string | null;
  crop: string | null;
  activity: Activity | null;
  category: CostCategory;
  amountPyg: number;
}
export interface ActualGroup {
  plotId: string | null;
  activity: Activity;
  category: CostCategory;
  amountPyg: number;
}
export interface BudgetRow extends BudgetLine {
  actualPyg: number;
  /** Real menos presupuesto: positivo en un costo = se pasó; positivo en una venta = superó lo previsto. */
  diffPyg: number;
  /** Real sobre presupuesto, en %; null sin presupuesto. */
  pct: number | null;
}

/**
 * Compara cada línea con lo real. `cropOf` da el cultivo de cada lote en la campaña. Una línea de un lote suma lo
 * de ese lote; de un cultivo, lo de los lotes de ese cultivo; sin alcance, todo lo de la campaña. Filtra por
 * actividad si la línea la trae y siempre por rubro.
 */
export function budgetVsActual(
  lines: BudgetLine[],
  actual: ActualGroup[],
  cropOf: Map<string, string | null>,
): BudgetRow[] {
  return lines.map((l) => {
    let sum = 0;
    for (const a of actual) {
      if (a.category !== l.category) continue;
      if (l.activity && a.activity !== l.activity) continue;
      if (l.plotId && a.plotId !== l.plotId) continue;
      if (l.crop && !(a.plotId && cropOf.get(a.plotId) === l.crop)) continue;
      sum += a.amountPyg;
    }
    return {
      ...l,
      actualPyg: sum,
      diffPyg: sum - l.amountPyg,
      pct: l.amountPyg > 0 ? Math.round((sum / l.amountPyg) * 1000) / 10 : null,
    };
  });
}

// ---------- Compras: orden, factura y recepción (E-33) ----------

export const maxPurchaseLines = 20;

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

export const purchaseInput = z.object({
  partyId: uuid.nullish(),
  farmId: uuid.nullish(),
  orderDate: isoDate,
  expectedDate: isoDate.nullish(),
  currency: currencySchema,
  note: optText(300),
  lines: z.array(purchaseLineInput).min(1).max(maxPurchaseLines),
});

export const purchaseInvoiceInput = z.object({
  invoiceNumber: z.string().trim().min(1).max(40),
  invoiceDate: isoDate,
  dueDate: isoDate.nullish(),
});

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

export type PurchaseStatus = "ordered" | "invoiced" | "received" | "complete";
/** Estado derivado: con factura y recepción está completa; la factura y la recepción pueden llegar en cualquier orden. */
export const purchaseStatus = (p: { invoiceNumber: string | null; receivedAt: string | null }): PurchaseStatus =>
  p.invoiceNumber && p.receivedAt ? "complete" : p.receivedAt ? "received" : p.invoiceNumber ? "invoiced" : "ordered";

// ---------- Venta de granos: contratos, entregas y liquidaciones (E-34) ----------

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

// ---------- Compras y ventas de hacienda (E-35) ----------

export const CATTLE_DEAL_KINDS = ["buy", "sell"] as const;
export type CattleDealKind = (typeof CATTLE_DEAL_KINDS)[number];

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

// ---------- Caja y bancos, cuentas a pagar y a cobrar (E-36) ----------

export const CASH_ACCOUNT_TYPES = ["cash", "bank"] as const;
export const DOC_KINDS = ["purchase", "settlement", "cattle"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const cashAccountInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(CASH_ACCOUNT_TYPES),
  currency: currencySchema,
  /** Saldo inicial en unidad menor (puede ser negativo: un sobregiro). */
  openingBalance: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).nullish(),
  note: optText(200),
});

export const cashMoveInput = z.object({
  accountId: uuid,
  date: isoDate,
  /** Con signo: positivo entra, negativo sale. */
  amount: z.number().int().refine((n) => n !== 0, "El monto no puede ser cero").refine((n) => Math.abs(n) <= 1_000_000_000_000),
  description: optText(200),
  partyId: uuid.nullish(),
});

export const cashTransferInput = z.object({
  fromAccountId: uuid,
  toAccountId: uuid,
  date: isoDate,
  amount: minorAmount.refine((n) => n > 0, "El monto tiene que ser mayor que cero"),
  description: optText(200),
});

export const settleInput = z.object({
  docKind: z.enum(DOC_KINDS),
  docId: uuid,
  accountId: uuid,
  date: isoDate,
  /** Lo que se paga o cobra ahora, en la moneda del documento. */
  amount: minorAmount.refine((n) => n > 0, "El monto tiene que ser mayor que cero"),
  description: optText(200),
});

export type DueStatus = "none" | "overdue" | "soon" | "ok";
/** Estado de un vencimiento al día `today`: vencido, por vencer (dentro de `soonDays`) o en fecha. */
export function dueStatus(dueDate: string | null, today: string, soonDays = 7): { status: DueStatus; daysLeft: number | null } {
  if (!dueDate) return { status: "none", daysLeft: null };
  const daysLeft = daysUntil(today, dueDate);
  return { status: daysLeft < 0 ? "overdue" : daysLeft <= soonDays ? "soon" : "ok", daysLeft };
}

// ---------- Exportación al contador (E-38) ----------

export interface AccountRef {
  code: string;
  name: string;
}
/** Plan de ejemplo: el contador lo reemplaza con los códigos de su plan de cuentas. */
export const DEFAULT_ACCOUNT_MAP: Record<CostCategory, AccountRef> = {
  input: { code: "5.1.01", name: "Insumos" },
  fuel: { code: "5.1.02", name: "Combustibles y lubricantes" },
  contractor: { code: "5.1.03", name: "Servicios de terceros" },
  labor: { code: "5.2.01", name: "Sueldos y jornales" },
  machinery: { code: "5.3.01", name: "Maquinaria: mantenimiento y repuestos" },
  other: { code: "5.9.01", name: "Otros gastos" },
  sale: { code: "4.1.01", name: "Ventas" },
};

export const accountMapInput = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(80),
});

/** Cuenta de un rubro: la que cargó el contador o, si no hay, la del plan de ejemplo. */
export const accountFor = (key: CostCategory, custom: Record<string, AccountRef>): AccountRef => custom[key] ?? DEFAULT_ACCOUNT_MAP[key];
