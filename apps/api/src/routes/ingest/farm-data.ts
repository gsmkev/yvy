/** Estancias, escenas, índices, clima, capas y climatología. */
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { INDEX_KINDS, LAYERS } from "@yvy/shared/schema";
import { parse } from "../../lib/http";
import { type IngestEnv, json, max } from "./shared";
import { uuid } from "../schemas";
import { Hono } from "hono";

export const routes = new Hono<IngestEnv>();

routes.get("/farms", async (c) => c.json(await c.var.sys.activeFarms()));

/** Última fecha cargada por estancia y fuente (para que los jobs bajen solo lo que falta). */
routes.get("/climate-latest", async (c) => c.json(await c.var.sys.climateLatest()));

/** A-31: análisis de suelo con coordenadas para el job fertility_maps. */
routes.get("/farms/:id/soil-points", async (c) => c.json(await c.var.sys.soilPoints(c.req.param("id"))));

routes.get("/farms/:id/geometry", async (c) => {
  const [row] = await c.var.sys.farmGeometry(c.req.param("id"));
  if (!row) throw new HTTPException(404);
  return c.json({ farm: JSON.parse(row.farm), plots: JSON.parse(row.plots) });
});

/** El job new_farm avisa que empezó (processing) o que el mapa base falló (failed). `ready` lo pone /farm-layers. */
routes.post("/farms/:id/imagery-status", async (c) => {
  const b = parse(z.object({ status: z.enum(["pending", "processing", "failed"]) }), json(c.var.body));
  if (!(await c.var.sys.setImageryStatus(c.req.param("id"), b.status))) throw new HTTPException(404);
  return c.json({ ok: true });
});

/** S-03: el job s2_history termina; solo cambia el estado de un pedido existente. */
routes.post("/farms/:id/history-status", async (c) => {
  const b = parse(z.object({ status: z.enum(["done", "failed"]) }), json(c.var.body));
  if (!(await c.var.sys.setHistoryStatus(c.req.param("id"), b.status))) throw new HTTPException(404);
  return c.json({ ok: true });
});

routes.post("/scenes", async (c) => {
  const b = parse(
    z.object({
      source: z.string().max(40),
      itemId: z.string().max(200),
      acquiredAt: z.number().int(),
      cloudPct: z.number().min(0).max(100).nullable(),
    }),
    json(c.var.body),
  );
  return c.json(await c.var.sys.upsertScene(b));
});

routes.post("/scenes/:id/processed", async (c) => {
  await c.var.sys.markSceneProcessed(c.req.param("id"));
  return c.json({ ok: true });
});

routes.post("/plot-index-stats", async (c) => {
  const b = parse(
    z.object({
      rows: z
        .array(
          z.object({
            plotId: uuid,
            sceneId: z.string(),
            acquiredAt: z.number().int(),
            idx: z.enum(INDEX_KINDS),
            mean: z.number().min(-1).max(1),
            p10: z.number().min(-1).max(1),
            p90: z.number().min(-1).max(1),
            validPct: z.number().min(0).max(100),
            lowConfidence: z.boolean().default(false),
          }),
        )
        .min(1)
        .max(max),
    }),
    json(c.var.body),
  );
  return c.json(await c.var.sys.upsertIndexStats(b.rows));
});

routes.post("/climate-daily", async (c) => {
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

routes.post("/farm-layers", async (c) => {
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
  // Retención: las versiones viejas de esta capa salen de D1 y de R2 (borrar en R2 no cuesta operaciones de clase A)
  const stale = await c.var.sys.pruneFarmLayers(b.farmId, b.layer);
  if (stale.length) await c.env.TILES.delete(stale);
  return c.json({ ...res, pruned: stale.length }, 201);
});

/** M-17: GeoTIFF por convertir de una estancia (job custom_layers). */
routes.get("/farms/:id/custom-layers-pending", async (c) => c.json(await c.var.sys.pendingCustomLayers(c.req.param("id"))));

/** M-17: el job termina una capa: PNG georreferenciado en R2 con sus 4 esquinas, o fallo. */
routes.post("/custom-layers/:id/result", async (c) => {
  const b = parse(
    z.discriminatedUnion("status", [
      z.object({ status: z.literal("failed") }),
      z.object({
        status: z.literal("ready"),
        imagePath: z.string().max(300),
        imageMime: z.enum(["image/png", "image/jpeg"]),
        bytes: z.number().int().positive(),
        corners: z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).length(4),
      }),
    ]),
    json(c.var.body),
  );
  if (!(await c.var.sys.finishCustomLayer(c.req.param("id"), b))) throw new HTTPException(404);
  return c.json({ ok: true });
});

/** Climatología 1991-2020 por día del año (job climatology_build). */
routes.post("/climatology", async (c) => {
  const b = parse(
    z.object({
      rows: z
        .array(
          z.object({
            farmId: uuid,
            plotId: z.string().default(""),
            dayOfYear: z.number().int().min(1).max(366),
            variable: z.enum(["precip", "soil_top", "soil_root", "tmin"]),
            p20: z.number().nullable(),
            p50: z.number().nullable(),
            p80: z.number().nullable(),
            mean: z.number().nullable(),
          }),
        )
        .min(1)
        .max(max),
    }),
    json(c.var.body),
  );
  return c.json({ written: await c.var.sys.upsertClimatology(b.rows) });
});
