/** Acceso a los textos de la interfaz en la web: reexporta el traductor de @yvy/shared. */
import { t as tShared, type MessageKey } from "@yvy/shared";

/** Claves de texto válidas (tipo de @yvy/shared). */
export type { MessageKey };
/** Traduce una clave conocida; el segundo argumento reemplaza variables. */
export const t = tShared;
/** Claves dinámicas armadas con un prefijo (ej. "ui.role_" + role). */
export const tk = (key: string, vars?: Record<string, string | number>) => tShared(key as MessageKey, vars);
