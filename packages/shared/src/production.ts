/**
 * Sistema productivo de la estancia y carga recomendada. Lógica pura compartida.
 * Las cargas son una referencia ORIENTATIVA (cada campo ajusta según su suelo y su manejo), no una recomendación técnica.
 */
import { t, type MessageKey } from "./i18n";
import type { ReproIndices } from "./repro";
import type { WeightSeries } from "./animals";
import type { CorralRow } from "./feedlot";

/** Sistemas productivos de una estancia. */
export const PRODUCTION_SYSTEMS = ["cria", "recria", "invernada", "ciclo_completo", "feedlot", "tambo"] as const;
/** Sistema productivo de una estancia. */
export type ProductionSystem = (typeof PRODUCTION_SYSTEMS)[number];

// ---------- carga recomendada ----------

/** Tipos de pastura. */
export const PASTURE_CLASSES = ["natural", "implantada", "mejorada"] as const;
/** Tipo de pastura. */
export type PastureClass = (typeof PASTURE_CLASSES)[number];

/** UA/ha de referencia por tipo de pastura, en la época normal. */
export const RECOMMENDED_UA_PER_HA: Record<PastureClass, number> = { natural: 0.5, implantada: 1.2, mejorada: 2 };
/** En invierno (junio a agosto) la oferta de pasto baja: 30 % menos. */
export const WINTER_FACTOR = 0.7;
/** Meses de invierno (1 a 12) en que baja la oferta de pasto. */
export const WINTER_MONTHS = [6, 7, 8] as const;
/** Rango permitido para una carga recomendada propia (UA/ha). */
export const RECOMMENDED_LOAD_LIMITS = { min: 0.1, max: 10 } as const;

/** Cargas recomendadas propias de la estancia por tipo de pastura (UA/ha). */
export type PastureLoads = Partial<Record<PastureClass, number>>;

/** Interpreta el texto libre "tipo de pastura" del potrero. Vacío = el tipo por defecto de la estancia. */
export function pastureClassOf(text: string | null | undefined, fallback: PastureClass = "natural"): PastureClass {
  const x = (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!x) return fallback;
  if (/natural|nativ|campo\s*sucio/.test(x)) return "natural";
  if (/mejorad|intensiv|riego|rotacion|fertiliz/.test(x)) return "mejorada";
  return "implantada";
}

/** ¿El mes (1 a 12) es de invierno? */
export const isWinterMonth = (month: number): boolean => (WINTER_MONTHS as readonly number[]).includes(month);

/** UA/ha recomendadas para un tipo de pastura en un mes, con los valores propios de la estancia si los cambió. */
export function recommendedUaPerHa(cls: PastureClass, month: number, overrides?: PastureLoads | null): number {
  const base = overrides?.[cls] ?? RECOMMENDED_UA_PER_HA[cls];
  return Math.round(base * (isWinterMonth(month) ? WINTER_FACTOR : 1) * 100) / 100;
}

/** Carga recomendada de un potrero frente a la hacienda actual. */
export interface PlotLoad {
  /** UA/ha recomendadas para el tipo de pastura y la época. */
  recommendedUaPerHa: number;
  /** UA que el potrero puede llevar con esa recomendación. */
  recommendedUa: number;
  /** UA actuales menos las recomendadas: positivo = sobran, negativo = faltan. */
  diffUa: number;
}

/** Carga recomendada de un potrero de `areaHa` según su pastura y el mes, comparada con sus `ua` actuales. */
export function plotLoad(ua: number, areaHa: number, cls: PastureClass, month: number, overrides?: PastureLoads | null): PlotLoad {
  const rec = recommendedUaPerHa(cls, month, overrides);
  const recUa = rec * areaHa;
  return { recommendedUaPerHa: rec, recommendedUa: Math.round(recUa * 10) / 10, diffUa: Math.round((ua - recUa) * 10) / 10 };
}

/** Mes (1 a 12) en Paraguay (UTC-3) de un instante. */
export const monthInParaguay = (ms: number): number => new Date(ms - 3 * 3_600_000).getUTCMonth() + 1;

// ---------- indicadores por sistema ----------

/** Indicador productivo calculable con lo registrado. */
export type IndicatorId =
  | "pregnancyPct"
  | "calvingPct"
  | "weaningPct"
  | "adg"
  | "kgPerHaYear"
  | "daysInField"
  | "conversion"
  | "feedlotAdg";
/** Unidad de un indicador productivo. */
export type IndicatorUnit = "pct" | "kg_day" | "kg_ha_year" | "days" | "ratio";
/** Valor de un indicador productivo. */
export interface Indicator {
  id: IndicatorId;
  value: number;
  unit: IndicatorUnit;
}

/** Qué indicadores mira cada sistema, en el orden en que se muestran. */
export const SYSTEM_INDICATORS: Record<ProductionSystem, readonly IndicatorId[]> = {
  cria: ["pregnancyPct", "calvingPct", "weaningPct"],
  recria: ["adg", "kgPerHaYear", "daysInField"],
  invernada: ["adg", "kgPerHaYear", "daysInField"],
  ciclo_completo: ["pregnancyPct", "calvingPct", "weaningPct", "adg", "kgPerHaYear", "daysInField"],
  feedlot: ["conversion", "feedlotAdg"],
  tambo: [],
};

/** Datos de los que se calculan los indicadores; cada uno es opcional. */
export interface IndicatorInput {
  repro?: ReproIndices | null;
  /** Series de pesadas por lote de animales (últimos 12 meses). */
  weights?: readonly WeightSeries[];
  /** Superficie de potreros de pastura, en ha. */
  pastureHa?: number;
  feedlot?: readonly CorralRow[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Indicadores del sistema con lo que ya se registra. Un indicador sin datos no aparece (nunca un cero inventado).
 * Ganancia diaria: promedio de los lotes ponderado por cabezas. Kg producidos por ha y año: lo que ganaron los lotes
 * pesados en los últimos 12 meses sobre la superficie de pastura. Días en campo: promedio entre primera y última pesada.
 */
export function productionIndicators(system: ProductionSystem | null, input: IndicatorInput): Indicator[] {
  if (!system) return [];
  const out: Indicator[] = [];
  const rp = input.repro;
  const gained = (input.weights ?? []).filter((w) => w.adgKg !== null && w.gainKg !== null && w.days !== null);
  const feedlotOk = (input.feedlot ?? []).filter((c) => c.status === "ok");
  for (const id of SYSTEM_INDICATORS[system]) {
    if (id === "pregnancyPct" && rp?.pregnancyPct != null && rp.checked > 0) out.push({ id, value: rp.pregnancyPct, unit: "pct" });
    else if (id === "calvingPct" && rp?.calvingPct != null && rp.calvesBorn > 0) out.push({ id, value: rp.calvingPct, unit: "pct" });
    else if (id === "weaningPct" && rp?.weaningPct != null && rp.weaned > 0) out.push({ id, value: rp.weaningPct, unit: "pct" });
    else if (id === "adg" && gained.length) {
      const heads = gained.reduce((a, w) => a + (w.points[w.points.length - 1]?.head ?? 1), 0);
      const sum = gained.reduce((a, w) => a + w.adgKg! * (w.points[w.points.length - 1]?.head ?? 1), 0);
      if (heads > 0) out.push({ id, value: r2(sum / heads), unit: "kg_day" });
    } else if (id === "kgPerHaYear" && gained.length && (input.pastureHa ?? 0) > 0) {
      const kg = gained.reduce((a, w) => a + w.gainKg! * (w.points[w.points.length - 1]?.head ?? 1), 0);
      if (kg > 0) out.push({ id, value: Math.round(kg / input.pastureHa!), unit: "kg_ha_year" });
    } else if (id === "daysInField" && gained.length) {
      const d = gained.reduce((a, w) => a + w.days!, 0) / gained.length;
      if (d > 0) out.push({ id, value: Math.round(d), unit: "days" });
    } else if (id === "conversion" && feedlotOk.length) {
      const dm = feedlotOk.reduce((a, c) => a + (c.windowKgDm ?? 0), 0);
      const kg = feedlotOk.reduce((a, c) => a + (c.gainKg ?? 0), 0);
      if (kg > 0) out.push({ id, value: r1(dm / kg), unit: "ratio" });
    } else if (id === "feedlotAdg") {
      const w = feedlotOk.filter((c) => c.dailyGainKg !== null && c.head);
      const heads = w.reduce((a, c) => a + c.head!, 0);
      if (heads > 0) out.push({ id, value: r2(w.reduce((a, c) => a + c.dailyGainKg! * c.head!, 0) / heads), unit: "kg_day" });
    }
  }
  return out;
}

/**
 * Secciones de la pestaña Hacienda que van primero (después de la hacienda) según el sistema.
 * Ids de sección de la web: stock, rotation, forage, animals, repro, weights, supplements, theft.
 */
export const SYSTEM_SECTION_ORDER: Record<ProductionSystem, readonly string[]> = {
  cria: ["plan", "repro", "animals", "rotation", "forage"],
  recria: ["weights", "rotation", "forage"],
  invernada: ["weights", "rotation", "forage"],
  ciclo_completo: ["plan", "repro", "weights", "rotation", "forage"],
  feedlot: ["weights", "supplements"],
  tambo: [],
};

/** Respuesta de GET /org/farms/:id/production. */
export interface ProductionResponse {
  system: ProductionSystem | null;
  indicators: Indicator[];
}

const nf = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const INDICATOR_TEXT: Record<IndicatorUnit, MessageKey> = {
  pct: "ui.herd.indPct",
  kg_day: "ui.herd.indKgDay",
  kg_ha_year: "ui.herd.indKgHaYear",
  days: "ui.herd.indDays",
  ratio: "ui.herd.indRatio",
};
/** Valor con su unidad, en es-PY ("80 %", "0,5 kg/día"). */
export const indicatorValueText = (i: Indicator): string => t(INDICATOR_TEXT[i.unit], { v: nf.format(i.value) });
/** Nombre del indicador. */
export const indicatorLabel = (i: Indicator): string => t(`ui.herd.ind_${i.id}` as MessageKey);
