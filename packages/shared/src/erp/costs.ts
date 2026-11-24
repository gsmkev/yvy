/** Costos y ventas: esquemas de entrada, resultado por campaña (costo, margen, rinde) y presupuesto contra lo real. */

import { z } from "zod";
import { uuid } from "./internal";
import { ACTIVITIES, type Activity, COST_CATEGORIES, type CostCategory, isoDate, optText, minorAmount, currencySchema } from "./core";

// ---------- Costos y ventas ----------

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

// ---------- Costo y margen ----------

/** Datos de una campaña o lote para calcular su resultado. */
export interface ResultInput {
  costPyg: number;
  incomePyg: number;
  areaHa: number;
  tons: number;
}
/** Resultado calculado: margen y costos o ingresos por hectárea y por tonelada. */
export interface ResultFigures {
  marginPyg: number;
  /** Guaraníes por hectárea; null sin superficie. */
  costPerHa: number | null;
  incomePerHa: number | null;
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
    incomePerHa: r.areaHa > 0 ? Math.round(r.incomePyg / r.areaHa) : null,
    marginPerHa: r.areaHa > 0 ? Math.round(marginPyg / r.areaHa) : null,
    costPerTon: r.tons > 0 ? Math.round(r.costPyg / r.tons) : null,
  };
}

// ---------- Presupuesto de campaña ----------

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

/** Línea de presupuesto de una campaña. */
export interface BudgetLine {
  id: string;
  plotId: string | null;
  crop: string | null;
  activity: Activity | null;
  category: CostCategory;
  amountPyg: number;
}
/** Gasto real agrupado por lote, actividad y rubro. */
export interface ActualGroup {
  plotId: string | null;
  activity: Activity;
  category: CostCategory;
  amountPyg: number;
}
/** Línea de presupuesto con su valor real y la diferencia. */
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
