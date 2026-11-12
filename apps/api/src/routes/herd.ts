/** Ganadería, segunda tanda (gan-p2): rotación, pasto, reproducción, pesadas, animales, abigeato, suplementos, calor. */
import { Hono } from "hono";
import { farmHeatStress } from "../db/herd";
import type { AppEnv } from "../types";

export const herd = new Hono<AppEnv>();

// G-32: estrés térmico (THI) de las próximas 48 horas.
herd.get("/farms/:id/heat-stress", async (c) => c.json(await farmHeatStress(c.var.sdb, c.req.param("id"))));
