/** Agricultura, segunda tanda (agri-p2): fenología, ventana de siembra, carencias, amortiguación, suelo, entregas. */
import { Hono } from "hono";
import { z } from "zod";
import { CROPS } from "@yvy/shared";
import { farmSowingWindow, farmWithdrawal, plotPhenology, plotWaterBalance } from "../db/agri2";
import { parse } from "../lib/http";
import type { AppEnv } from "../types";

export const agri2 = new Hono<AppEnv>();

/** A-04: fenología estimada por grados-día contra lo observado en el lote. */
agri2.get("/plots/:id/phenology", async (c) => c.json(await plotPhenology(c.var.sdb, c.req.param("id"))));

/** A-05: ventana de siembra de los próximos días para un cultivo. */
agri2.get("/farms/:id/sowing-window", async (c) => {
  const q = parse(z.object({ crop: z.enum(CROPS).default("soja") }), c.req.query());
  return c.json(await farmSowingWindow(c.var.sdb, c.req.param("id"), q.crop));
});

/** C-08: balance hídrico simple del lote (lluvia menos consumo del cultivo). */
agri2.get("/plots/:id/water-balance", async (c) => c.json(await plotWaterBalance(c.var.sdb, c.req.param("id"))));

/** A-14: carencia antes de cosechar: lotes con restricción vigente y cosechas hechas antes de tiempo. */
agri2.get("/farms/:id/withdrawal", async (c) => c.json(await farmWithdrawal(c.var.sdb, c.req.param("id"))));
