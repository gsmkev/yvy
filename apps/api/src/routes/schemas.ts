/** Esquemas Zod de entrada que comparten varias rutas. */
import { z } from "zod";

export const uuid = z.string().uuid();
/** Día calendario `YYYY-MM-DD`. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const num = z.coerce.number().int().nonnegative();
