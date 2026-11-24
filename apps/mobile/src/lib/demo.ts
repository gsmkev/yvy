/**
 * Sesión de demostración: el servidor entrega la sesión del dueño de la organización de ejemplo (plan `demo`, solo
 * lectura). La sesión no trae el plan, así que se recuerda en `kv` a qué organización pertenece la demo: cualquier otro
 * ingreso trae otra organización y deja de ser demo solo, sin tener que limpiar nada.
 */
import { useSyncExternalStore } from "react";
import { getDb } from "./db";
import { isDemoOrg } from "./demoLogic";
import { useSession } from "./session";

export { forceReadOnly } from "./demoLogic";

const DEMO_ORG_KEY = "demo_org_id";

let version = 0;
const subs = new Set<() => void>();
const bump = () => (version++, subs.forEach((f) => f()));

/** Marca la organización como de demostración (o la desmarca con null). */
export function markDemo(orgId: string | null): void {
  getDb().setKv(DEMO_ORG_KEY, orgId);
  bump();
}

/** Indica si `orgId` es la organización de demostración marcada. */
export function isDemoSession(orgId: string | null | undefined): boolean {
  return isDemoOrg(getDb().getKv(DEMO_ORG_KEY), orgId);
}

/** Indica si la sesión actual es de demostración. */
export function useIsDemo(): boolean {
  const orgId = useSession()?.organization.id;
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => version,
  );
  return isDemoSession(orgId);
}
