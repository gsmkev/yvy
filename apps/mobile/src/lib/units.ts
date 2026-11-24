/** Preferencias de unidades en `kv` y hook para las pantallas (la lógica pura está en unitsLogic.ts). */
import { useSyncExternalStore } from "react";
import { getDb } from "./db";
import { parseUnits, type Units } from "./unitsLogic";

export * from "./unitsLogic";
const UNITS_KEY = "units";

let version = 0;
const subs = new Set<() => void>();
export function getUnits(): Units {
  return parseUnits(getDb().getKv(UNITS_KEY));
}
export function setUnits(patch: Partial<Units>): void {
  getDb().setKv(UNITS_KEY, JSON.stringify({ ...getUnits(), ...patch }));
  version++;
  subs.forEach((f) => f());
}
/** Unidades elegidas; las pantallas se redibujan al cambiarlas. */
export function useUnits(): Units {
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => version,
  );
  return getUnits();
}
