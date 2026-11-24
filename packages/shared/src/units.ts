/**
 * Unidades de visualización. Los datos siempre se guardan en ha, mm y °C; la preferencia de cada usuario
 * (localStorage en la web, `kv` en la app) solo cambia cómo se muestran. Acá solo está la parte pura.
 */

/**
 * Cuadra cuadrada paraguaya: 100 varas x 100 varas, con 1 vara = 0,866 m (norma técnica PNA 65 001 21;
 * ver https://en.wikipedia.org/wiki/Paraguayan_units_of_measurement). 86,6 m x 86,6 m = 7.499,56 m², que en la
 * práctica se redondea a 0,75 ha exactas. Ojo: el 0,7438 que circula en algunos pedidos no coincide con esa norma.
 */
export const CUADRA_HA = 0.75;
const MM_PER_INCH = 25.4;

/** Unidad de superficie: hectáreas o cuadras. */
export type AreaUnit = "ha" | "cuadra";
/** Unidad de lluvia: milímetros o pulgadas. */
export type RainUnit = "mm" | "in";
/** Unidad de temperatura: Celsius o Fahrenheit. */
export type TempUnit = "c" | "f";
/** Unidades de visualización elegidas por un usuario. */
export interface Units {
  area: AreaUnit;
  rain: RainUnit;
  temp: TempUnit;
}
/** Unidades por defecto: ha, mm y °C. */
export const DEFAULT_UNITS: Units = { area: "ha", rain: "mm", temp: "c" };

const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);

/** Lee lo guardado (JSON) tolerando vacío o dato corrupto. */
export function parseUnits(raw: string | null): Units {
  try {
    const o = JSON.parse(raw ?? "{}") as Partial<Record<keyof Units, unknown>>;
    return { area: pick(o.area, ["ha", "cuadra"], "ha"), rain: pick(o.rain, ["mm", "in"], "mm"), temp: pick(o.temp, ["c", "f"], "c") };
  } catch {
    return DEFAULT_UNITS;
  }
}

/** Hectáreas en la unidad de superficie elegida. */
export const haToArea = (ha: number, u: AreaUnit): number => (u === "cuadra" ? ha / CUADRA_HA : ha);
/** Milímetros en la unidad de lluvia elegida. */
export const mmToRain = (mm: number, u: RainUnit): number => (u === "in" ? mm / MM_PER_INCH : mm);
/** Grados Celsius en la unidad de temperatura elegida. */
export const cToTemp = (c: number, u: TempUnit): number => (u === "f" ? (c * 9) / 5 + 32 : c);
/** Rótulo de una unidad de superficie. */
export const areaLabel = (u: AreaUnit): string => (u === "cuadra" ? "cuadras" : "ha");
/** Rótulo de una unidad de lluvia. */
export const rainLabel = (u: RainUnit): string => (u === "in" ? "pulg" : "mm");
/** Rótulo de una unidad de temperatura. */
export const tempLabel = (u: TempUnit): string => (u === "f" ? "°F" : "°C");
