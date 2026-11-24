/**
 * Unidades de visualización. Los datos siempre se guardan en ha, mm y °C;
 * la preferencia (por usuario, en localStorage) solo cambia cómo se muestran.
 */
import {
  areaLabel as areaLabelOf,
  cToTemp as cToTempOf,
  haToArea as haToAreaOf,
  mmToRain as mmToRainOf,
  parseUnits,
  rainLabel as rainLabelOf,
  tempLabel as tempLabelOf,
  type AreaUnit,
  type RainUnit,
  type TempUnit,
  type Units,
} from "@yvy/shared";
import { getSession } from "./api";

export { CUADRA_HA, type Units } from "@yvy/shared";

const key = () => `yvy.units.${getSession()?.user.id ?? "anon"}`;
const listeners = new Set<() => void>();
let cache: { k: string; v: Units } | null = null;

export function getUnits(): Units {
  const k = key();
  if (cache?.k === k) return cache.v;
  let v = parseUnits(null);
  try {
    v = parseUnits(localStorage.getItem(k));
  } catch {
    /* sin storage: valores por defecto */
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

export const haToArea = (ha: number, u: AreaUnit = getUnits().area) => haToAreaOf(ha, u);
export const mmToRain = (mm: number, u: RainUnit = getUnits().rain) => mmToRainOf(mm, u);
export const cToTemp = (c: number, u: TempUnit = getUnits().temp) => cToTempOf(c, u);
export const areaLabel = (u: AreaUnit = getUnits().area) => areaLabelOf(u);
export const rainLabel = (u: RainUnit = getUnits().rain) => rainLabelOf(u);
export const tempLabel = (u: TempUnit = getUnits().temp) => tempLabelOf(u);
