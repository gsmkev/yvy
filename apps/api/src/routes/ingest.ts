/**
 * Entrada de los jobs Python que corren en GitHub Actions (PRD-cloudflare §4.6).
 * Firma: X-Yvy-Signature = hex(HMAC-SHA256(INGEST_SECRET, `${timestamp}.${METHOD}.${path}.${body}`)),
 * X-Yvy-Timestamp en epoch ms, tolerancia LIMITS.ingest.maxSkewMs. Lotes de ≤ 40 filas.
 */
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { LAYERS } from "@yvy/shared/schema";
import { LIMITS } from "@yvy/shared";
import { getDb } from "../db/client";
import { SystemDb } from "../db/system";
import { hmacVerifyHex } from "../lib/crypto";
import { parse } from "../lib/http";
import type { Bindings } from "../types";

type IngestEnv = { Bindings: Bindings; Variables: { body: string; sys: SystemDb } };

const verify = createMiddleware<IngestEnv>(async (c, next) => {
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
});

const json = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    throw new HTTPException(400, { message: "JSON inválido" });
  }
};

const uuid = z.string().uuid();
const max = LIMITS.ingest.maxRowsPerRequest;

export const ingest = new Hono<IngestEnv>();
ingest.use("*", verify);

ingest.get("/farms", async (c) => c.json(await c.var.sys.activeFarms()));

ingest.get("/farms/:id/geometry", async (c) => {
  const [row] = await c.var.sys.farmGeometry(c.req.param("id"));
  if (!row) throw new HTTPException(404);
  return c.json({ farm: JSON.parse(row.farm), plots: JSON.parse(row.plots) });
});

ingest.post("/scenes", async (c) => {
  const b = parse(
    z.object({
      source: z.string().max(40),
      itemId: z.string().max(200),
      acquiredAt: z.number().int(),
      cloudPct: z.number().min(0).max(100).nullable(),
    }),
    json(c.var.body),
  );
  return c.json({ id: await c.var.sys.upsertScene(b) });
});

ingest.post("/plot-index-stats", async (c) => {
  const b = parse(
    z.object({
      rows: z
        .array(
          z.object({
            plotId: uuid,
            sceneId: z.string(),
            acquiredAt: z.number().int(),
            idx: z.literal("ndvi"),
            mean: z.number().min(-1).max(1),
            p10: z.number().min(-1).max(1),
            p90: z.number().min(-1).max(1),
            validPct: z.number().min(0).max(100),
          }),
        )
        .min(1)
        .max(max),
    }),
    json(c.var.body),
  );
  return c.json(await c.var.sys.upsertIndexStats(b.rows));
});

ingest.post("/climate-daily", async (c) => {
  const b = parse(
    z.object({
      rows: z
        .array(
          z.object({
            farmId: uuid,
            plotId: z.string().default(""),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            source: z.enum(["chirps", "chirps_prelim", "nasa_power"]),
            precipMm: z.number().min(0).nullish(),
            tminC: z.number().nullish(),
            tmaxC: z.number().nullish(),
            soilMoisture0_7: z.number().nullish(),
            soilMoisture7_28: z.number().nullish(),
          }),
        )
        .min(1)
        .max(max),
    }),
    json(c.var.body),
  );
  return c.json({ written: await c.var.sys.upsertClimateDaily(b.rows) });
});

ingest.post("/farm-layers", async (c) => {
  const b = parse(
    z.object({
      farmId: uuid,
      layer: z.enum(LAYERS),
      acquiredAt: z.number().int(),
      pmtilesPath: z.string().max(300),
      bytes: z.number().int().positive(),
      bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
    json(c.var.body),
  );
  const res = await c.var.sys.addFarmLayer({ ...b, bounds: JSON.stringify(b.bounds) });
  if (!res) throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json(res, 201);
});
