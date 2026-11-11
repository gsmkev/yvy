/** Service worker (U-17): solo en la versión de producción. Nunca en dev ni en tests. */
import { getSession, onSession } from "./api";

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
  // Los datos guardados para ver sin conexión son de una sola organización y de una sola persona:
  // se descartan al cerrar sesión o cambiar de organización.
  let org = getSession()?.organization.id;
  onSession((s) => {
    const next = s?.organization.id;
    if (next !== org) navigator.serviceWorker.controller?.postMessage("clear-data");
    org = next;
  });
}
