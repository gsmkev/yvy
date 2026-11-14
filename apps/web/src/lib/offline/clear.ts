/**
 * Borrado de todo lo que la web guardó en el dispositivo (ADR 0005): al cerrar sesión o cambiar de organización.
 * Cada módulo con datos locales (caché de lecturas, outbox, mapas guardados) registra su propio borrado acá.
 * No depende de que el service worker esté activo: la página borra las cachés por su cuenta y además le avisa.
 */
import { MSG_CLEAR_DATA, PRIVATE_CACHES } from "../../sw/names";

type Wipe = () => Promise<unknown> | unknown;
const wipes = new Set<Wipe>();

/** Registra un borrado; devuelve cómo sacarlo. */
export function onClearLocalData(fn: Wipe): () => void {
  wipes.add(fn);
  return () => {
    wipes.delete(fn);
  };
}

export async function clearLocalData(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) navigator.serviceWorker.controller?.postMessage(MSG_CLEAR_DATA);
  } catch {
    /* sin service worker */
  }
  const jobs: Promise<unknown>[] = [...wipes].map(async (w) => w());
  if (typeof caches !== "undefined") jobs.push(...PRIVATE_CACHES.map((n) => caches.delete(n)));
  // Un borrado que falla no frena a los otros: todos tienen que intentarse.
  await Promise.allSettled(jobs);
}
