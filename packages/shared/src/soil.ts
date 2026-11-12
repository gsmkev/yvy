/**
 * Análisis de suelo (A-30): interpretación de los valores de laboratorio. Rangos de referencia para suelos de
 * soja y maíz de la Región Oriental; cada laboratorio y cada agrónomo puede usar otros, por eso son solo una guía.
 */
export type SoilLevel = "low" | "medium" | "high";
export type SoilParam = "ph" | "pMgKg" | "kCmolKg" | "omPct";
export const SOIL_PARAMS: readonly SoilParam[] = ["ph", "pMgKg", "kCmolKg", "omPct"];

/** [límite bajo-medio, límite medio-alto]: abajo del primero es bajo, arriba del segundo es alto. */
export const SOIL_RANGES: Record<SoilParam, [number, number]> = {
  ph: [5.0, 6.5],
  pMgKg: [8, 14],
  kCmolKg: [0.15, 0.3],
  omPct: [1.5, 3],
};

export const soilLevel = (param: SoilParam, v: number | null): SoilLevel | null => {
  if (v === null || !Number.isFinite(v)) return null;
  const [lo, hi] = SOIL_RANGES[param];
  return v < lo ? "low" : v > hi ? "high" : "medium";
};

export interface SoilValues {
  ph: number | null;
  pMgKg: number | null;
  kCmolKg: number | null;
  omPct: number | null;
}

/** Promedio por parámetro de varias muestras (ignora los nulos); null si ninguna lo trae. */
export function soilAverage(samples: SoilValues[]): SoilValues {
  const avg = (k: SoilParam) => {
    const v = samples.map((s) => s[k]).filter((x): x is number => x !== null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
  };
  return { ph: avg("ph"), pMgKg: avg("pMgKg"), kCmolKg: avg("kCmolKg"), omPct: avg("omPct") };
}
