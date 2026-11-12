/**
 * Modo solo lectura (F-29): el dueño mira todo el campo sin tocar nada por accidente. Se prende solo para el rol
 * "owner" y se puede cambiar desde Más; administrador y agrónomo arrancan con la app completa. Los empleados no
 * tienen el modo: ellos solo anotan.
 */
import { useSyncExternalStore } from "react";
import { getDb } from "./db";
import { resolveReadOnly } from "./ownerSummary";
import { useSession } from "./session";

export const READ_ONLY_KEY = "read_only";

let version = 0;
const subs = new Set<() => void>();

/** Guarda la elección en este celular y avisa a las pantallas abiertas. */
export function setReadOnly(on: boolean): void {
  getDb().setKv(READ_ONLY_KEY, on ? "1" : "0");
  version++;
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f));
const snapshot = () => version;

/** ¿La app está en solo lectura para esta persona? Se actualiza al cambiar el interruptor. */
export function useReadOnly(): boolean {
  const role = useSession()?.organization.role;
  useSyncExternalStore(subscribe, snapshot);
  return resolveReadOnly(role, getDb().getKv(READ_ONLY_KEY));
}
