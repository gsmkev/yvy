import { esPY, type Messages } from "./es-PY";
import { gnPY } from "./gn-PY";

/** Idiomas de la interfaz. es-PY es el de referencia: lo que otro idioma no traduce, se muestra en es-PY (U-22). */
export const LOCALES = ["es-PY", "gn-PY"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es-PY";

/** Cada idioma con su propio nombre, para el selector (no se traduce). */
export const LOCALE_NAMES: Record<Locale, string> = { "es-PY": "Castellano", "gn-PY": "Avañe'ẽ" };

type Tree = { [k: string]: string | Tree };
export const locales: Record<Locale, Tree> = { "es-PY": esPY as unknown as Tree, "gn-PY": gnPY as unknown as Tree };

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export const getLocale = (): Locale => current;

/** Cambia el idioma de `t` y avisa a quien lo escucha (la app vuelve a dibujar todo). */
export const setLocale = (l: Locale): void => {
  if (l === current) return;
  current = l;
  for (const f of listeners) f();
};

export const subscribeLocale = (f: () => void): (() => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

const find = (tree: Tree, key: string): string | undefined => {
  let node: unknown = tree;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
};

/** Texto de `key` en el idioma activo; si ese idioma no lo tiene, el de es-PY. */
export const t = (key: MessageKey, vars: Record<string, string | number> = {}, locale: Locale = current): string => {
  const text = find(locales[locale], key) ?? find(locales[DEFAULT_LOCALE], key);
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? `{{${k}}}`));
};

/** ¿Existe la clave? Para textos armados dinámicamente (valores de registros). Mira es-PY, que tiene todas. */
export const hasKey = (key: string, locale: Locale = DEFAULT_LOCALE): boolean => find(locales[locale], key) !== undefined;
