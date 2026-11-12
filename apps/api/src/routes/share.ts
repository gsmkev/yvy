/** Ruta pública (sin sesión) de los enlaces de solo lectura (K-04). El token se compara por su hash. */
import { Hono } from "hono";
import { getDb } from "../db/client";
import { SystemDb } from "../db/system";
import { sha256Hex } from "../lib/crypto";
import type { AppEnv } from "../types";

export const share = new Hono<AppEnv>();

share.get("/shared/:token", async (c) => {
  const token = c.req.param("token");
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return c.json({ error: "Enlace inexistente" }, 404);
  const res = await new SystemDb(getDb(c.env.DB)).sharedSummary(await sha256Hex(token), Date.now());
  if ("error" in res) {
    if (res.error === "not_found") return c.json({ error: "Enlace inexistente" }, 404);
    return c.json(
      { error: res.error === "expired" ? "El enlace venció" : "El enlace fue revocado", reason: res.error },
      410,
    );
  }
  return c.json(res);
});
