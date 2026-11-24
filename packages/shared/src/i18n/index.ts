/** Textos de la interfaz: idiomas, idioma activo, búsqueda de claves tipadas y claves compartidas con la landing. */

import { esPY, type Messages } from "./es-PY";
import { gnPY } from "./gn-PY";

/** Idiomas de la interfaz. es-PY es el de referencia: lo que otro idioma no traduce, se muestra en es-PY. */
export const LOCALES = ["es-PY", "gn-PY"] as const;
/** Idioma de la interfaz. */
export type Locale = (typeof LOCALES)[number];
/** Idioma por defecto. */
export const DEFAULT_LOCALE: Locale = "es-PY";

/** Cada idioma con su propio nombre, para el selector (no se traduce). */
export const LOCALE_NAMES: Record<Locale, string> = { "es-PY": "Castellano", "gn-PY": "Avañe'ẽ" };

type Tree = { [k: string]: string | Tree };
/** Árbol de textos de cada idioma. */
export const locales: Record<Locale, Tree> = { "es-PY": esPY as unknown as Tree, "gn-PY": gnPY as unknown as Tree };

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Clave de texto válida: ruta con puntos hasta un texto de es-PY. */
export type MessageKey = Leaves<Messages>;

/** Si `v` es un idioma admitido. */
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

/** Idioma activo. */
export const getLocale = (): Locale => current;

/** Cambia el idioma de `t` y avisa a quien lo escucha (la app vuelve a dibujar todo). */
export const setLocale = (l: Locale): void => {
  if (l === current) return;
  current = l;
  for (const f of listeners) f();
};

/** Escucha los cambios de idioma; devuelve la función para dejar de escuchar. */
export const subscribeLocale = (f: () => void): (() => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

const step = (node: unknown, part: string): unknown =>
  node !== null && typeof node === "object" && Object.hasOwn(node, part) ? (node as Record<string, unknown>)[part] : undefined;

const find = (tree: Tree, key: string): string | undefined => {
  const node = key.split(".").reduce<unknown>(step, tree);
  return typeof node === "string" ? node : undefined;
};

/** Texto de `key` en el idioma activo; si ese idioma no lo tiene, el de es-PY. */
export const t = (key: MessageKey, vars: Record<string, string | number> = {}, locale: Locale = current): string => {
  const text = find(locales[locale], key) ?? find(locales[DEFAULT_LOCALE], key);
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? `{{${k}}}`));
};

/** `t` para claves armadas en tiempo de ejecución (`ui.alert.kind_${kind}`): único punto donde un `string` pasa a `MessageKey`. */
export const tk = (key: string, vars: Record<string, string | number> = {}, locale: Locale = current): string => t(key as MessageKey, vars, locale);

/** ¿Existe la clave? Para textos armados dinámicamente (valores de registros). Mira es-PY, que tiene todas. */
export const hasKey = (key: string, locale: Locale = DEFAULT_LOCALE): boolean =>
  find(locales[locale], key) !== undefined;

/** Claves de las atribuciones de datos; la landing las lee con estos nombres, por eso no están agrupadas. */
export const ATTRIBUTION = {
  copernicus: "attribution.copernicus",
  chirps: "attribution.chirps",
  nasaPower: "attribution.nasaPower",
  firms: "attribution.firms",
  metNorway: "attribution.metNorway",
} as const satisfies Record<string, MessageKey>;

/** Enlaces del pie público; la landing los lee con estos nombres. */
export const PUBLIC_FOOTER = {
  terms: "ui.publicFooterTerms",
  privacy: "ui.publicFooterPrivacy",
  status: "ui.publicFooterStatus",
} as const satisfies Record<string, MessageKey>;
