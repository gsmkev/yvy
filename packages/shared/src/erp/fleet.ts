/** Maquinaria y contratistas, mantenimiento preventivo y costo de labor propia frente a contratista. */

import { z } from "zod";
import { uuid } from "./internal";
import { MACHINE_TYPES, METER_KINDS, CONTRACTOR_SERVICES, RATE_UNITS, isoDate, optText, minorAmount, currencySchema } from "./core";

// ---------- Maquinaria ----------

/** Alta o cambio de una máquina o vehículo. */
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

// ---------- Contratistas ----------

/** Alta o cambio de la tarifa de un contratista por servicio. */
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

// ---------- Mantenimiento preventivo ----------

/** Tipos de servicio de mantenimiento: preventivo o reparación. */
export const MAINTENANCE_KINDS = ["preventive", "repair"] as const;
/** Estado del próximo servicio de un plan de mantenimiento. */
export type MaintenanceStatus = "ok" | "soon" | "overdue";
/** Se avisa cuando falta esta fracción del intervalo (o menos) para el próximo servicio. */
export const MAINTENANCE_WARN_FRACTION = 0.1;

/** Plan de mantenimiento: servicio que se repite cada cierto uso del medidor. */
export const maintenancePlanInput = z.object({
  machineId: uuid,
  name: z.string().trim().min(1).max(80),
  everyUnits: z.number().positive().max(1_000_000),
  /** Lectura del medidor en el último servicio (0 si es nueva). */
  lastDoneMeter: z.number().min(0).max(10_000_000).nullish(),
});

/** Servicio de mantenimiento realizado a una máquina. */
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

// ---------- Costo de labor propia frente a contratista ----------

/** Datos para comparar el costo de hacer el servicio con maquinaria propia. */
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

/** Entrada del cálculo del costo propio por hora. */
export interface OwnCostInput {
  fuelLitersPerHour: number | null;
  fuelPricePyg: number | null;
  operatorPerHourPyg: number;
  purchasePricePyg: number;
  residualPyg: number;
  lifeHours: number;
  haPerHour: number | null;
}
/** Costo propio por hora y por hectárea. */
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
