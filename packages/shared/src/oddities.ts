/**
 * X-26: registros raros para revisar. Reglas simples y explicables, sin IA: marcan un registro para que una persona lo
 * mire en la web; no lo cambian ni lo rechazan. Todos los umbrales están en LIMITS.oddities (valores por defecto
 * generales, a revisar por un agrónomo; la dosis habitual de cada producto la carga la organización).
 */
import { LIMITS } from "./limits";
import { localDate } from "./tasks";

export const ODDITY_RULES = ["rain_high", "pest_off_season", "dose_out_of_range", "yield_impossible"] as const;
export type OddityRule = (typeof ODDITY_RULES)[number];

/** Dosis habitual de un producto por hectárea, en la unidad base del producto (l o kg). null = sin tope de ese lado. */
export interface DoseRange {
  min: number | null;
  max: number | null;
  unit: "l" | "kg";
}

export interface OddityContext {
  /** Lote del registro, para el rinde de una cosecha. */
  plot?: { crop: string | null; areaHa: number } | null;
  /** Por id de producto del catálogo. */
  doseRanges?: ReadonlyMap<string, DoseRange>;
}

export type Oddity =
  | { rule: "rain_high"; mm: number; max: number }
  | { rule: "pest_off_season"; pest: string; month: number }
  | { rule: "dose_out_of_range"; product: string; dose: number; unit: string; min: number | null; max: number | null; baseUnit: "l" | "kg" }
  | { rule: "yield_impossible"; tHa: number; max: number; crop: string };

/** Dosis a la unidad base del producto (l/ha o kg/ha), o null si la unidad es de otra familia. */
export function doseInBase(dose: number, unit: string): { value: number; base: "l" | "kg" } | null {
  switch (unit) {
    case "l_ha":
      return { value: dose, base: "l" };
    case "ml_ha":
      return { value: dose / 1000, base: "l" };
    case "kg_ha":
      return { value: dose, base: "kg" };
    case "g_ha":
      return { value: dose / 1000, base: "kg" };
    default:
      return null;
  }
}

const inWindow = (month: number, [from, to]: readonly [number, number]) =>
  from <= to ? month >= from && month <= to : month >= from || month <= to;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Qué tiene de raro un registro. Lista vacía si nada. `data` es el JSON ya validado del registro. */
export function recordOddities(kind: string, data: unknown, capturedAt: number, ctx: OddityContext = {}): Oddity[] {
  const d = (data ?? {}) as Record<string, unknown>;
  const L = LIMITS.oddities;
  const out: Oddity[] = [];

  if (kind === "rain") {
    const mm = num(d.mm);
    if (mm !== null && mm > L.rainMmPerDay) out.push({ rule: "rain_high", mm, max: L.rainMmPerDay });
  }

  if (kind === "pest" && typeof d.pest === "string") {
    const window = (L.pestMonths as Record<string, readonly [number, number]>)[d.pest];
    const month = Number(localDate(capturedAt).slice(5, 7));
    if (window && !inWindow(month, window)) out.push({ rule: "pest_off_season", pest: d.pest, month });
  }

  if (kind === "application" && Array.isArray(d.products) && ctx.doseRanges) {
    for (const p of d.products as Record<string, unknown>[]) {
      const range = typeof p.productId === "string" ? ctx.doseRanges.get(p.productId) : undefined;
      const dose = num(p.dose);
      if (!range || dose === null || typeof p.unit !== "string") continue;
      const base = doseInBase(dose, p.unit);
      if (!base || base.base !== range.unit) continue;
      if ((range.min !== null && base.value < range.min) || (range.max !== null && base.value > range.max))
        out.push({
          rule: "dose_out_of_range",
          product: typeof p.name === "string" ? p.name : "",
          dose,
          unit: p.unit,
          min: range.min,
          max: range.max,
          baseUnit: range.unit,
        });
    }
  }

  if (kind === "harvest") {
    const tons = num(d.tons);
    const area = num(d.areaHa) ?? ctx.plot?.areaHa ?? null;
    const crop = ctx.plot?.crop;
    if (tons !== null && area !== null && area > 0 && crop) {
      const max = (L.maxYieldTHa as Record<string, number>)[crop];
      const tHa = tons / area;
      if (max !== undefined && tHa > max) out.push({ rule: "yield_impossible", tHa: round(tHa), max, crop });
    }
  }
  return out;
}
