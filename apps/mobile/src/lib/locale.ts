/**
 * Idioma de la app (U-22). Se guarda en la base local (kv), así vale sin señal. Al cambiarlo, la raíz de la app se
 * vuelve a armar (ver app/_layout.tsx) y todos los textos salen en el idioma nuevo.
 */
import { DEFAULT_LOCALE, isLocale, setLocale, type Locale } from "@yvy/shared";
import type { Kv } from "./forecast";

const KEY = "locale";

export function readLocale(kv: Kv): Locale {
  const v = kv.getKv(KEY);
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Al abrir la app: pone el idioma guardado antes de dibujar nada. */
export function loadLocale(kv: Kv): Locale {
  const l = readLocale(kv);
  setLocale(l);
  return l;
}

export function chooseLocale(kv: Kv, l: Locale): void {
  kv.setKv(KEY, l);
  setLocale(l);
}
