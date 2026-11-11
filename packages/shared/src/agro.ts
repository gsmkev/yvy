/**
 * Cálculos agronómicos puros (ADR 0004): Delta T y unidades de dosis.
 * Sin dependencias: corren en el Worker, la web y Hermes.
 */

/** Unidad de la dosis de un producto, por hectárea. */
export const DOSE_UNITS = ["l_ha", "ml_ha", "kg_ha", "g_ha"] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

/** Unidades que ofrece el celular según la unidad del producto: la grande primero. */
export const DOSE_UNITS_FOR: Record<"l" | "kg", readonly [DoseUnit, DoseUnit]> = {
  l: ["l_ha", "ml_ha"],
  kg: ["kg_ha", "g_ha"],
};

/**
 * Delta T (°C): temperatura menos temperatura de bulbo húmedo. Mide cuánto se evapora una gota en el aire.
 * Bulbo húmedo por la aproximación de Stull (2011), válida con 5 a 99 % de humedad relativa y -20 a 50 °C.
 * Devuelve null fuera de ese rango o con datos que no son números.
 */
export function deltaT(tempC: number, humidityPct: number): number | null {
  if (!Number.isFinite(tempC) || !Number.isFinite(humidityPct)) return null;
  if (tempC < -20 || tempC > 50 || humidityPct < 5 || humidityPct > 99) return null;
  const rh = humidityPct;
  const wet =
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;
  return Math.round((tempC - wet) * 10) / 10;
}

/**
 * Rinde (t/ha) de un lote en una campaña a partir de sus cosechas. Si todas traen superficie se usa la suma;
 * si alguna no la trae, la superficie del lote (una cosecha sin superficie se toma como el lote entero).
 * Devuelve null sin toneladas o sin superficie.
 */
export function yieldTHa(harvests: { tons: number; areaHa?: number | null }[], plotAreaHa: number): number | null {
  if (!harvests.length) return null;
  const tons = harvests.reduce((a, h) => a + h.tons, 0);
  const allHaveArea = harvests.every((h) => typeof h.areaHa === "number" && h.areaHa > 0);
  const area = allHaveArea ? harvests.reduce((a, h) => a + (h.areaHa as number), 0) : plotAreaHa;
  if (!(area > 0) || !(tons > 0)) return null;
  return Math.round((tons / area) * 100) / 100;
}
