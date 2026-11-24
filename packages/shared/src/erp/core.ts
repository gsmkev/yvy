/**
 * Base del ERP: monedas, actividades, rubros de costo, conversión de dinero a unidad menor y esquemas de entrada
 * comunes.
 */

import { z } from "zod";

/** Monedas admitidas; PYG sin decimales, USD en centavos. */
export const CURRENCIES = ["PYG", "USD"] as const;
/** Moneda admitida del ERP. */
export type Currency = (typeof CURRENCIES)[number];
/** Actividades a las que se imputa un costo o una venta. */
export const ACTIVITIES = ["agricultura", "ganaderia", "administracion"] as const;
/** Actividad a la que se imputa un costo o una venta. */
export type Activity = (typeof ACTIVITIES)[number];
/** Rol de un tercero: proveedor, cliente o ambos. */
export const PARTY_KINDS = ["supplier", "customer", "both"] as const;
/** Tipos de máquina o vehículo del parque. */
export const MACHINE_TYPES = ["tractor", "sprayer", "harvester", "planter", "truck", "pickup", "other"] as const;
/** Unidad del medidor de una máquina: horas o kilómetros. */
export const METER_KINDS = ["hours", "km"] as const;
/** Servicios que prestan los contratistas. */
export const CONTRACTOR_SERVICES = ["sowing", "spraying", "harvest", "freight", "other"] as const;
/** Unidades de la tarifa de un contratista: por hectárea, por hora o por tonelada. */
export const RATE_UNITS = ["ha", "hour", "ton"] as const;
/** Tipos de depósito: galpón, tanque de combustible o silo. */
export const WAREHOUSE_TYPES = ["shed", "tank", "silo"] as const;
/** Origen de un movimiento de stock. */
export const STOCK_ORIGINS = ["purchase", "consumption", "transfer", "adjustment"] as const;
/** Origen de un movimiento de stock. */
export type StockOrigin = (typeof STOCK_ORIGINS)[number];
/** `sale` es ingreso (venta); el resto son costos. */
export const COST_CATEGORIES = ["input", "fuel", "contractor", "labor", "machinery", "other", "sale"] as const;
/** Rubro de un costo o una venta. */
export type CostCategory = (typeof COST_CATEGORIES)[number];

// ---------- Dinero ----------

const MINOR: Record<Currency, number> = { PYG: 1, USD: 100 };

/** De lo que se escribe (guaraníes o dólares con decimales) a la unidad menor entera. */
export const toMinor = (major: number, currency: Currency): number => Math.round(major * MINOR[currency]);
/** De la unidad menor entera a lo que se escribe (guaraníes o dólares con decimales). */
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

/** Fecha calendario "YYYY-MM-DD". */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Texto opcional: la API pasa "" a null antes de guardar (cleanRow), así un PATCH no pisa lo que no manda. */
export const optText = (max: number) => z.string().trim().max(max).nullish();

/** Monto en unidad menor: entero no negativo. */
export const minorAmount = z.number().int().min(0).max(1_000_000_000_000);

/** Validador de moneda. */
export const currencySchema = z.enum(CURRENCIES);
/** Alta de un tipo de cambio diario. */
export const exchangeRateInput = z.object({
  date: isoDate,
  /** Guaraníes por dólar (entero). */
  usdToPyg: z.number().int().min(1).max(100_000),
});
