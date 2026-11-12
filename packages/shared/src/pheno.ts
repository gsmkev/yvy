/**
 * Fenología estimada por grados-día (A-04). Se acumulan los grados-día de crecimiento (GDD) desde la siembra con la
 * temperatura mínima y máxima diaria de NASA POWER y se comparan con el estado que anotó la gente en el campo
 * (registro `crop_status`).
 *
 * Los umbrales son valores de referencia de la literatura (suma térmica desde la siembra), no una calibración local:
 * sirven para ver "adelantado" o "atrasado" respecto de lo esperado, no para decidir una aplicación por sí solos.
 */
import type { PHENO_STAGES } from "./records";
import type { CROPS } from "./schema";

type Crop = (typeof CROPS)[number];
type Stage = (typeof PHENO_STAGES)[number];

/** Orden fenológico; el índice sirve para comparar etapas. */
export const STAGE_ORDER: readonly Stage[] = [
  "siembra",
  "emergencia",
  "vegetativo",
  "floracion",
  "llenado",
  "madurez",
  "cosecha",
];

export interface CropGdd {
  /** Temperatura base (°C): por debajo no hay crecimiento. */
  baseC: number;
  /** Temperatura tope (°C): por encima no suma más. */
  capC: number;
  /** GDD acumulados desde la siembra a los que se alcanza cada etapa (siembra = 0). */
  stages: Record<Stage, number>;
}

/** `chia` y `otro` no tienen referencia confiable: no se estima. */
export const CROP_GDD: Partial<Record<Crop, CropGdd>> = {
  soja: {
    baseC: 10,
    capC: 30,
    stages: { siembra: 0, emergencia: 90, vegetativo: 200, floracion: 650, llenado: 1050, madurez: 1500, cosecha: 1650 },
  },
  maiz: {
    baseC: 10,
    capC: 30,
    stages: { siembra: 0, emergencia: 80, vegetativo: 180, floracion: 800, llenado: 1000, madurez: 1500, cosecha: 1700 },
  },
  trigo: {
    baseC: 0,
    capC: 30,
    stages: { siembra: 0, emergencia: 120, vegetativo: 350, floracion: 1300, llenado: 1600, madurez: 2000, cosecha: 2150 },
  },
  arroz: {
    baseC: 10,
    capC: 30,
    stages: { siembra: 0, emergencia: 100, vegetativo: 450, floracion: 1150, llenado: 1350, madurez: 1750, cosecha: 1900 },
  },
  girasol: {
    baseC: 6,
    capC: 30,
    stages: { siembra: 0, emergencia: 100, vegetativo: 300, floracion: 900, llenado: 1200, madurez: 1650, cosecha: 1800 },
  },
};

/** Grados-día de un día (método de umbrales: las temperaturas se acotan a [base, tope] antes de promediar). */
export function gddDay(tminC: number, tmaxC: number, baseC: number, capC: number): number {
  const hi = Math.min(Math.max(tmaxC, baseC), capC);
  const lo = Math.min(Math.max(tminC, baseC), capC);
  return Math.max(0, (hi + lo) / 2 - baseC);
}

/** Acumula GDD de una serie diaria {date, tminC, tmaxC}; los días sin dato no suman y se cuentan aparte. */
export function accumulateGdd(
  days: { date: string; tminC: number | null; tmaxC: number | null }[],
  crop: Crop,
  fromDate: string,
): { gdd: number; days: number } | null {
  const cfg = CROP_GDD[crop];
  if (!cfg) return null;
  let gdd = 0;
  let n = 0;
  for (const d of days) {
    if (d.date < fromDate || d.tminC === null || d.tmaxC === null) continue;
    gdd += gddDay(d.tminC, d.tmaxC, cfg.baseC, cfg.capC);
    n++;
  }
  return { gdd: Math.round(gdd), days: n };
}

/** Etapa más avanzada cuyo umbral ya se alcanzó. */
export function estimateStage(crop: Crop, gdd: number): Stage | null {
  const cfg = CROP_GDD[crop];
  if (!cfg) return null;
  let out: Stage = "siembra";
  for (const st of STAGE_ORDER) if (gdd >= cfg.stages[st]) out = st;
  return out;
}

/** Próxima etapa y cuántos GDD faltan; null si ya está en la última. */
export function nextStage(crop: Crop, gdd: number): { stage: Stage; gddLeft: number } | null {
  const cfg = CROP_GDD[crop];
  if (!cfg) return null;
  const next = STAGE_ORDER.find((st) => cfg.stages[st] > gdd);
  return next ? { stage: next, gddLeft: Math.round(cfg.stages[next] - gdd) } : null;
}

export type PhenoComparison = "ahead" | "on_track" | "behind";

/**
 * Observado contra estimado: una etapa de diferencia todavía es "en tiempo" (las etapas son anchas y el que anota
 * redondea); dos o más es adelantado o atrasado.
 */
export function comparePheno(estimated: Stage, observed: Stage): PhenoComparison {
  const diff = STAGE_ORDER.indexOf(observed) - STAGE_ORDER.indexOf(estimated);
  return diff >= 2 ? "ahead" : diff <= -2 ? "behind" : "on_track";
}
