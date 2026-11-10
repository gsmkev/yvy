// El botón "Anotar" vive en el layout de pestañas; una pantalla puede ocultarlo mientras muestra su propia acción.
import { useSyncExternalStore } from "react";

let hidden = false;
const subs = new Set<() => void>();

export function setFabHidden(v: boolean) {
  if (v === hidden) return;
  hidden = v;
  subs.forEach((f) => f());
}

export function useFabHidden(): boolean {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => hidden,
  );
}
