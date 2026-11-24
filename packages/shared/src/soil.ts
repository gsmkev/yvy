/**
 * Análisis de suelo: interpretación de los valores de laboratorio. Rangos de referencia para suelos de
 * soja y maíz de la Región Oriental; cada laboratorio y cada agrónomo puede usar otros, por eso son solo una guía.
 */

/** Nivel interpretado de un parámetro del suelo. */
export type SoilLevel = "low" | "medium" | "high";
/** Parámetro de un análisis de suelo: pH, fósforo, potasio y materia orgánica. */
export type SoilParam = "ph" | "pMgKg" | "kCmolKg" | "omPct";
/** Parámetros del análisis en el orden en que se muestran. */
export const SOIL_PARAMS: readonly SoilParam[] = ["ph", "pMgKg", "kCmolKg", "omPct"];

/** Par (límite bajo-medio, límite medio-alto): abajo del primero es bajo, arriba del segundo es alto. */
export const SOIL_RANGES: Record<SoilParam, [number, number]> = {
  ph: [5.0, 6.5],
  pMgKg: [8, 14],
  kCmolKg: [0.15, 0.3],
  omPct: [1.5, 3],
};

/** Nivel (bajo, medio o alto) de un valor según los rangos de referencia; null sin dato. */
export const soilLevel = (param: SoilParam, v: number | null): SoilLevel | null => {
  if (v === null || !Number.isFinite(v)) return null;
  const [lo, hi] = SOIL_RANGES[param];
  return v < lo ? "low" : v > hi ? "high" : "medium";
};

/** Valores de un análisis de suelo: pH, P (mg/kg), K (cmol/kg) y materia orgánica (%). */
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

/** Capa de fertilidad de cada parámetro del análisis. */
export const FERT_LAYER_PARAM = { fert_ph: "ph", fert_p: "pMgKg", fert_k: "kCmolKg", fert_om: "omPct" } as const satisfies Record<string, SoilParam>;
/** Clave de una capa de fertilidad. */
export type FertLayerKey = keyof typeof FERT_LAYER_PARAM;
/** Claves de las capas de fertilidad. */
export const FERT_LAYER_KEYS = Object.keys(FERT_LAYER_PARAM) as FertLayerKey[];

const FERT_RAMP = ["#F1EEE4", "#C9C46A", "#7A9A3F", "#3F6B35"]; // de poco a mucho
const FERT_PH_RAMP = ["#B5562E", "#D9A93A", "#7A9A3F", "#8DB3C7"]; // de ácido a alcalino
/** Rampa y rango de cada mapa: los mismos que INDEX_STYLE en workers-py/yvy_workers/tiles.py (el ráster viene coloreado). */
export const FERT_STYLE: Record<FertLayerKey, { ramp: string[]; lo: number; hi: number; unit: string }> = {
  fert_ph: { ramp: FERT_PH_RAMP, lo: 4, hi: 8, unit: "" },
  fert_p: { ramp: FERT_RAMP, lo: 0, hi: 30, unit: "mg/kg" },
  fert_k: { ramp: FERT_RAMP, lo: 0, hi: 0.6, unit: "cmolc/kg" },
  fert_om: { ramp: FERT_RAMP, lo: 0, hi: 6, unit: "%" },
};

/** Análisis con coordenadas y valor del parámetro, una ubicación una vez (~1 m): cuántos puntos tiene cada mapa. */
export function fertilityPointCounts(
  samples: { lon: number | null; lat: number | null; ph: number | null; pMgKg: number | null; kCmolKg: number | null; omPct: number | null }[],
): Record<FertLayerKey, number> {
  const out = {} as Record<FertLayerKey, number>;
  for (const key of FERT_LAYER_KEYS) {
    const field = FERT_LAYER_PARAM[key];
    const seen = new Set<string>();
    for (const x of samples) if (x.lon !== null && x.lat !== null && x[field] !== null) seen.add(`${x.lon.toFixed(5)},${x.lat.toFixed(5)}`);
    out[key] = seen.size;
  }
  return out;
}
