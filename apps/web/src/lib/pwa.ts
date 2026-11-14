/**
 * Service worker (ADR 0005): solo en la versión de producción. Nunca en dev ni en tests.
 * La versión nueva queda esperando; la persona la activa con "Actualizar" (mensaje skip-waiting).
 */
import { MSG_SKIP_WAITING } from "../sw/names";

let waiting: ServiceWorker | null = null;
let reloading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** ¿Hay una versión nueva descargada y esperando? */
export const updateAvailable = () => waiting !== null;
export const onUpdateAvailable = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Activa la versión que espera; en cuanto toma el control se recarga la página. */
export function applyUpdate() {
  if (!waiting) return;
  reloading = true;
  waiting.postMessage(MSG_SKIP_WAITING);
}

/** Cada cuánto se busca una versión nueva con la app abierta. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

function track(reg: ServiceWorkerRegistration) {
  const check = () => {
    // Solo es "actualización" si ya había un service worker controlando: la primera instalación no avisa.
    if (reg.waiting && navigator.serviceWorker.controller) {
      waiting = reg.waiting;
      emit();
    }
  };
  check();
  reg.addEventListener("updatefound", () => {
    const sw = reg.installing;
    sw?.addEventListener("statechange", () => {
      if (sw.state === "installed") check();
    });
  });
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        track(reg);
        setInterval(() => void reg.update().catch(() => {}), CHECK_EVERY_MS);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) window.location.reload();
  });
}
