/**
 * ERP sencillo (ADR 0004): constantes, esquemas de entrada y cálculos puros (dinero, stock, costos).
 * Sin dependencias de la base: corre en el Worker, la web y las pruebas.
 *
 * Dinero: siempre enteros en la unidad menor de la moneda. PYG no tiene decimales (1 = un guaraní);
 * USD va en centavos. Todo costo guarda además su valor en guaraníes (`amountPyg`) con el tipo de cambio
 * del día, así los informes suman con una sola consulta.
 */
import { z } from "zod";

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
