/** Visibilidad del botón flotante "Anotar": vive en el layout de pestañas y una pantalla puede ocultarlo mientras muestra su propia acción. */
import { useSyncExternalStore } from "react";

let hidden = false;
const subs = new Set<() => void>();

/** Oculta o muestra el botón flotante. */
export function setFabHidden(v: boolean) {
  if (v === hidden) return;
  hidden = v;
  subs.forEach((f) => f());
}

/** Indica si el botón flotante está oculto. */
export function useFabHidden(): boolean {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => hidden,
  );
}
