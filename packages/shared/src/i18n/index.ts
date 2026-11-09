import { esPY, type Messages } from "./es-PY";

export const locales = { "es-PY": esPY } as const;
export type Locale = keyof typeof locales;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

export const t = (key: MessageKey, vars: Record<string, string | number> = {}, locale: Locale = "es-PY"): string => {
  let node: unknown = locales[locale];
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  return String(node).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? `{{${k}}}`));
};
