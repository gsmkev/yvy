import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

/** Valida el body con Zod y devuelve 400 con el primer error. */
export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HTTPException(400, { message: `${i?.path.join(".") || "body"}: ${i?.message}` });
  }
  return r.data;
};

export const readJson = async (req: { json: () => Promise<unknown> }): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    throw new HTTPException(400, { message: "JSON inválido" });
  }
};
