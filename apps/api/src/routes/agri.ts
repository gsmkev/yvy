/** Agricultura desde la web (ADR 0004): campañas, plan por lote e historial del lote. */
import { Hono } from "hono";
import { z } from "zod";
import { CROPS } from "@yvy/shared";
import {
  createSeason,
  deletePlotSeason,
  deleteSeason,
  listSeasons,
  plotHistory,
  updateSeason,
  upsertPlotSeason,
} from "../db/agri";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

export const agri = new Hono<AppEnv>();

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const seasonInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    startDate: isoDate.nullish(),
    endDate: isoDate.nullish(),
    active: z.boolean().default(true),
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, { message: "El fin va después del inicio" });

agri.get("/seasons", async (c) => {
  const q = parse(z.object({ farmId: uuid.optional() }), c.req.query());
  return c.json(await listSeasons(c.var.sdb, q.farmId));
});

agri.post("/seasons", async (c) => {
  const b = parse(seasonInput, await readJson(c.req));
  return c.json(
    await createSeason(c.var.sdb, {
      name: b.name,
      startDate: b.startDate ?? null,
      endDate: b.endDate ?? null,
      active: b.active,
    }),
    201,
  );
});

agri.patch("/seasons/:id", async (c) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1).max(80).optional(),
      startDate: isoDate.nullish(),
      endDate: isoDate.nullish(),
      active: z.boolean().optional(),
    }),
    await readJson(c.req),
  );
  await updateSeason(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});

agri.delete("/seasons/:id", async (c) => {
  await deleteSeason(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

agri.put("/seasons/:seasonId/plots/:plotId", async (c) => {
  const b = parse(
    z.object({
      crop: z.enum(CROPS).nullish(),
      variety: z.string().trim().max(80).nullish(),
      plannedSowingDate: isoDate.nullish(),
      targetYieldTHa: z.number().positive().max(100).nullish(),
    }),
    await readJson(c.req),
  );
  await upsertPlotSeason(c.var.sdb, c.req.param("plotId"), c.req.param("seasonId"), {
    crop: b.crop ?? null,
    variety: b.variety || null,
    plannedSowingDate: b.plannedSowingDate ?? null,
    targetYieldTHa: b.targetYieldTHa ?? null,
  });
  return c.json({ ok: true });
});

agri.delete("/seasons/:seasonId/plots/:plotId", async (c) => {
  await deletePlotSeason(c.var.sdb, c.req.param("plotId"), c.req.param("seasonId"));
  return c.json({ ok: true });
});

agri.get("/plots/:id/seasons", async (c) => c.json(await plotHistory(c.var.sdb, c.req.param("id"))));
