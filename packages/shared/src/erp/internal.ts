import { z } from "zod";

/** Solo para los módulos de erp/: no se reexporta. */
export const uuid = z.string().uuid();
