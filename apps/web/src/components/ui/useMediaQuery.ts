/** Suscripción a una media query del navegador. */
import { useSyncExternalStore } from "react";

/**
 * Valor actual de una media query y re-render cuando cambia.
 * @param fallback valor cuando no hay `matchMedia` (pruebas y render sin navegador): por defecto, pantalla ancha.
 */
export function useMediaQuery(query: string, fallback = false) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia?.(query);
      m?.addEventListener("change", cb);
      return () => m?.removeEventListener("change", cb);
    },
    () => window.matchMedia?.(query).matches ?? fallback,
    () => fallback,
  );
}

/** Verdadero bajo 640 px: el celular, donde las tablas pasan a tarjetas y los filtros a una hoja. */
export const useIsPhone = () => useMediaQuery("(max-width: 639px)");
