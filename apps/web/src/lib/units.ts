/**
 * Unidades de visualización (U-23). Los datos siempre se guardan en ha, mm y °C;
 * la preferencia (por usuario, en localStorage) solo cambia cómo se muestran.
 */
import { getSession } from "./api";

/**
 * Cuadra cuadrada paraguaya: 100 varas x 100 varas, con 1 vara = 0,866 m (norma técnica PNA 65 001 21;
 * ver https://en.wikipedia.org/wiki/Paraguayan_units_of_measurement). 86,6 m x 86,6 m = 7.499,56 m², que en la
 * práctica se redondea a 0,75 ha exactas. Ojo: el 0,7438 que circula en algunos pedidos no coincide con esa norma.
 */
export const VARA_M = 0.866;
export const CUADRA_HA = 0.75;
export const MM_PER_INCH = 25.4;

export type AreaUnit = "ha" | "cuadra";
export type RainUnit = "mm" | "in";
export type TempUnit = "c" | "f";
export interface Units {
  area: AreaUnit;
  rain: RainUnit;
  temp: TempUnit;
}
export const DEFAULT_UNITS: Units = { area: "ha", rain: "mm", temp: "c" };

const key = () => `yvy.units.${getSession()?.user.id ?? "anon"}`;
const listeners = new Set<() => void>();
let cache: { k: string; v: Units } | null = null;

const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);

export function getUnits(): Units {
  const k = key();
  if (cache?.k === k) return cache.v;
  let v = DEFAULT_UNITS;
  try {
    const raw = JSON.parse(localStorage.getItem(k) ?? "{}") as Partial<Record<keyof Units, unknown>>;
    v = {
      area: pick(raw.area, ["ha", "cuadra"], "ha"),
      rain: pick(raw.rain, ["mm", "in"], "mm"),
      temp: pick(raw.temp, ["c", "f"], "c"),
    };
  } catch {
    /* sin storage o dato corrupto: valores por defecto */
  }
  cache = { k, v };
  return v;
}

export function setUnits(patch: Partial<Units>) {
  const v = { ...getUnits(), ...patch };
  cache = { k: key(), v };
  try {
    localStorage.setItem(key(), JSON.stringify(v));
  } catch {
    /* modo privado o storage bloqueado */
  }
  listeners.forEach((l) => l());
}

export const subscribeUnits = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Solo para tests: descarta el caché en memoria. */
export const resetUnitsCache = () => {
  cache = null;
};

export const haToArea = (ha: number, u: AreaUnit = getUnits().area) => (u === "cuadra" ? ha / CUADRA_HA : ha);
export const mmToRain = (mm: number, u: RainUnit = getUnits().rain) => (u === "in" ? mm / MM_PER_INCH : mm);
export const cToTemp = (c: number, u: TempUnit = getUnits().temp) => (u === "f" ? (c * 9) / 5 + 32 : c);
export const areaLabel = (u: AreaUnit = getUnits().area) => (u === "cuadra" ? "cuadras" : "ha");
export const rainLabel = (u: RainUnit = getUnits().rain) => (u === "in" ? "pulg" : "mm");
export const tempLabel = (u: TempUnit = getUnits().temp) => (u === "f" ? "°F" : "°C");
