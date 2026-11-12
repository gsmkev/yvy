/** P-04: estado público del servicio (JSON). Sin sesión y sin datos de clientes. */
import { Hono } from "hono";
import { getDb } from "../db/client";
import { serviceStatus } from "../db/status";
import type { AppEnv } from "../types";

export const status = new Hono<AppEnv>();

status.get("/status", async (c) => {
  c.header("Cache-Control", "public, max-age=30");
  c.header("X-Robots-Tag", "noindex");
  return c.json(await serviceStatus(c.env, getDb(c.env.DB)));
});
