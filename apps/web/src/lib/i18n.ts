import { t as tShared, type MessageKey } from "@yvy/shared";

export type { MessageKey };
export const t = tShared;
/** Claves dinámicas armadas con un prefijo (ej. "ui.role_" + role). */
export const tk = (key: string, vars?: Record<string, string | number>) => tShared(key as MessageKey, vars);
