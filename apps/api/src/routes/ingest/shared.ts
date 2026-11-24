/** Verificación de la firma y piezas comunes del ingreso de datos. */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { LIMITS } from "@yvy/shared";
import { getDb } from "../../db/client";
import { recordIngest } from "../../db/status";
import { SystemDb } from "../../db/system";
import { hmacVerifyHex } from "../../lib/crypto";
import type { Bindings } from "../../types";

/** Entorno de las rutas de ingesta: el cuerpo ya leído y la base con acceso de sistema. */
export type IngestEnv = { Bindings: Bindings; Variables: { body: string; sys: SystemDb } };

/**
 * Verifica la firma HMAC de `timestamp.método.ruta.cuerpo` y que el reloj no difiera más de lo permitido.
 * @throws HTTPException 401 si la marca de tiempo o la firma no son válidas.
 */
export const verify = createMiddleware<IngestEnv>(async (c, next) => {
  const ts = Number(c.req.header("x-yvy-timestamp"));
  const sig = c.req.header("x-yvy-signature") ?? "";
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > LIMITS.ingest.maxSkewMs)
    throw new HTTPException(401, { message: "timestamp" });
  const body = await c.req.text();
  const path = new URL(c.req.url).pathname;
  if (
    !c.env.INGEST_SECRET ||
    !(await hmacVerifyHex(c.env.INGEST_SECRET, `${ts}.${c.req.method}.${path}.${body}`, sig))
  ) {
    throw new HTTPException(401, { message: "firma" });
  }
  c.set("body", body);
  c.set("sys", new SystemDb(getDb(c.env.DB)));
  await next();
  // Anota la corrida del job (solo pedidos ya autenticados); una falla al anotar nunca rompe el ingreso de datos
  await recordIngest(getDb(c.env.DB), path, c.res.status).catch((e) => console.error("[status] anotar corrida", e));
});

/**
 * Parsea el cuerpo ya leído como JSON.
 * @throws HTTPException 400 si no es JSON válido.
 */
export const json = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    throw new HTTPException(400, { message: "JSON inválido" });
  }
};

/** Máximo de filas por pedido de ingesta. */
export const max = LIMITS.ingest.maxRowsPerRequest;
