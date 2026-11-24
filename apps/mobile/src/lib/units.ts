/** Preferencias de unidades en `kv` y hook para las pantallas (la lógica pura está en @yvy/shared). */
import { useSyncExternalStore } from "react";
import { getDb } from "./db";
import { parseUnits, type Units } from "@yvy/shared";


const UNITS_KEY = "units";

let version = 0;
const subs = new Set<() => void>();
/** Unidades elegidas por la persona (superficie, lluvia, temperatura). */
export function getUnits(): Units {
  return parseUnits(getDb().getKv(UNITS_KEY));
}
/** Cambia las unidades indicadas en `patch` y avisa a las pantallas. */
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
