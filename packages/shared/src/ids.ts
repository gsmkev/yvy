/** Generación y validación de ids de registros (UUIDv7, generados en el cliente) y reloj en epoch ms. */

import { uuidv7 } from "uuidv7";

/** Id nuevo UUIDv7: ordenable por tiempo y generado sin conexión. */
export const newId = (): string => uuidv7();
/** Instante actual en epoch ms. */
export const now = (): number => Date.now();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** ¿Es un UUID versión 7 bien formado? */
export const isUuidV7 = (s: string): boolean => UUID_RE.test(s);
