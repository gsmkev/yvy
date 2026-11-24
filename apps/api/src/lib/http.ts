/**
 * Utilidades HTTP de las rutas: validación de cuerpos con Zod y lectura segura de JSON.
 */
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { isTimeOfDay } from "@yvy/shared";

/** Valida el body con Zod y devuelve 400 con el primer error.
 * @throws HTTPException 400 con la ruta y el mensaje del primer error. */
export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HTTPException(400, { message: `${i?.path.join(".") || "body"}: ${i?.message}` });
  }
  return r.data;
};

/**
 * Lee el cuerpo JSON de una request.
 * @throws HTTPException 400 si no es JSON válido.
 */
export const readJson = async (req: { json: () => Promise<unknown> }): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    throw new HTTPException(400, { message: "JSON inválido" });
  }
};

/** Hora del día "HH:MM". */
export const timeOfDay = z.string().refine(isTimeOfDay, "Hora inválida (HH:MM)");
