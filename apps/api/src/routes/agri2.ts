/** Agricultura, segunda tanda (agri-p2): fenología, ventana de siembra, carencias, amortiguación, suelo, entregas. */
import { Hono } from "hono";
import { plotPhenology } from "../db/agri2";
import type { AppEnv } from "../types";

export const agri2 = new Hono<AppEnv>();

/** A-04: fenología estimada por grados-día contra lo observado en el lote. */
agri2.get("/plots/:id/phenology", async (c) => c.json(await plotPhenology(c.var.sdb, c.req.param("id"))));
