/**
 * Idioma de la interfaz (U-22). Se guarda en este navegador. Se importa primero en main.tsx para que el idioma esté
 * puesto antes de que cualquier pantalla arme sus textos; cambiarlo recarga la página.
 */
import { DEFAULT_LOCALE, getLocale, isLocale, setLocale, type Locale } from "@yvy/shared";

const KEY = "yvy.locale";

export function readLocale(): Locale {
  try {
    const v = localStorage.getItem(KEY);
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Atributo `lang` de la página según el idioma (para lectores de pantalla y el corrector del navegador). */
const htmlLang = (l: Locale) => (l === "gn-PY" ? "gn" : "es-PY");

export function applyLocale(l: Locale): void {
  setLocale(l);
  document.documentElement.lang = htmlLang(l);
}

/** Guarda la elección y recarga: los textos ya dibujados y los que se arman al cargar cambian todos juntos. */
export function chooseLocale(l: Locale): void {
  if (l === getLocale()) return;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  applyLocale(l);
  window.location.reload();
}

applyLocale(readLocale());
