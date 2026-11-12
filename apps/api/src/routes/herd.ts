/** Ganadería, segunda tanda (gan-p2): rotación, pasto, reproducción, pesadas, animales, abigeato, suplementos, calor. */
import { Hono } from "hono";
import { z } from "zod";
import { farmHeatStress, farmSupplements, farmTheft } from "../db/herd";
import { parse } from "../lib/http";
import type { AppEnv } from "../types";

export const herd = new Hono<AppEnv>();

// G-32: estrés térmico (THI) de las próximas 48 horas.
herd.get("/farms/:id/heat-stress", async (c) => c.json(await farmHeatStress(c.var.sdb, c.req.param("id"))));

/** Rango opcional de fechas (epoch ms) de los listados. */
const range = z.object({
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
});

// G-13: abigeato (faltantes y denuncias).
herd.get("/farms/:id/theft", async (c) => {
  const q = parse(range, c.req.query());
  return c.json(await farmTheft(c.var.sdb, c.req.param("id"), q.from, q.to));
});

// G-31: suplementación y sal mineral por potrero.
herd.get("/farms/:id/supplements", async (c) => {
  const q = parse(range, c.req.query());
  return c.json(await farmSupplements(c.var.sdb, c.req.param("id"), q.from, q.to));
});
