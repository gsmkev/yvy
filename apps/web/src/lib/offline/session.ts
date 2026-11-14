/**
 * Arranque y ciclo de vida de lo local (ADR 0005): a quién pertenece lo guardado, la copia de lecturas y el borrado
 * al cerrar sesión o cambiar de organización. Todo falla en silencio: sin IndexedDB la web anda como antes.
 */
import type { QueryClient } from "@tanstack/react-query";
import { getSession, onSession, type Session } from "../api";
import { clearLocalData } from "./clear";
import { kvGet, kvSet } from "./db";
import { bustFor, queryPersistence, type QueryPersistence } from "./persist";

const OWNER_KEY = "owner";

/** Dueño de lo guardado: usuario y organización. Vacío si no hay sesión o es de soporte (no se guarda nada). */
export const ownerOf = (s: Session | null): string => (s && !s.support ? `${s.user.id}:${s.organization.id}` : "");

const within = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

let persistence: QueryPersistence | null = null;
let owner = "";

/** Lo que esté guardado y no sea de esta sesión se borra antes de usar nada. */
async function claim(next: string): Promise<void> {
  let stored: string | undefined;
  try {
    stored = await kvGet<string>(OWNER_KEY);
  } catch {
    return; // sin IndexedDB no hay nada que reclamar
  }
  if (stored !== undefined && stored !== next) await clearLocalData();
  owner = next;
  if (next) await kvSet(OWNER_KEY, next).catch(() => {});
}

/** Se llama una vez, antes de dibujar la app. */
export async function initOffline(queryClient: QueryClient): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  persistence = queryPersistence(queryClient);
  const s = getSession();
  await within(
    (async () => {
      await claim(ownerOf(s));
      if (owner) await persistence!.start(bustFor(s));
    })().catch(() => {}),
    1500,
  );
  onSession((next) => {
    const o = ownerOf(next);
    if (o === owner) return;
    owner = o;
    persistence?.stop();
    void (async () => {
      await clearLocalData();
      if (o) {
        await kvSet(OWNER_KEY, o).catch(() => {});
        await persistence?.start(bustFor(next)).catch(() => {});
      }
    })();
  });
}
