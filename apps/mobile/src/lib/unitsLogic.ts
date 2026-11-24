/**
 * Unidades de visualización (como la web, `apps/web/src/lib/units.ts`). Los datos siempre se guardan en ha, mm y °C;
 * la preferencia vive en `kv` y solo cambia cómo se muestran. Cuadra cuadrada paraguaya = 0,75 ha.
 */

const CUADRA_HA = 0.75;
const MM_PER_INCH = 25.4;

type AreaUnit = "ha" | "cuadra";
export type RainUnit = "mm" | "in";
export type TempUnit = "c" | "f";
export interface Units {
  area: AreaUnit;
  rain: RainUnit;
  temp: TempUnit;
}
const DEFAULT_UNITS: Units = { area: "ha", rain: "mm", temp: "c" };

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

export const haToArea = (ha: number, u: AreaUnit): number => (u === "cuadra" ? ha / CUADRA_HA : ha);
export const mmToRain = (mm: number, u: RainUnit): number => (u === "in" ? mm / MM_PER_INCH : mm);
export const cToTemp = (c: number, u: TempUnit): number => (u === "f" ? (c * 9) / 5 + 32 : c);
export const areaLabel = (u: AreaUnit): string => (u === "cuadra" ? "cuadras" : "ha");
export const rainLabel = (u: RainUnit): string => (u === "in" ? "pulg" : "mm");
export const tempLabel = (u: TempUnit): string => (u === "f" ? "°F" : "°C");

