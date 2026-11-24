/** Estancias, lotes, líneas y puntos de interés: ver, editar, partir y unir. */
import { z } from "zod";
import { areaHa, bboxOf } from "@yvy/geo";
import { CROPS, LIMITS, PLOT_KINDS, SEASONS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { deleteFarm, deletePlot, farmClimate, farmDetail, farmForecast, farmEudr, farmHistoryStatus, plotVigorHistory, farmProblemAreas, farmRiskReport, farmSummaries, mergePlots, plotGeometryWarnings, splitPlot, updateFarm, updatePlot } from "../../db/queries";
import { createLine, deleteLine, listFarmLines, updateLine } from "../../db/lines";
import { parse, readJson } from "../../lib/http";
import { plotArea } from "../org";
import type { AppEnv } from "../../types";
import { isoDate } from "../schemas";
import { Hono } from "hono";

export const routes = new Hono<AppEnv>();

routes.get("/org/farms", async (c) => c.json(await farmSummaries(c.var.sdb)));
routes.get("/org/farms/:id", async (c) => c.json(await farmDetail(c.var.sdb, c.req.param("id"))));
routes.get("/org/farms/:id/climate", async (c) =>
  c.json(await farmClimate(c.var.sdb, c.req.param("id"), Math.min(Math.max(Number(c.req.query("days")) || 90, 1), 400))),
);

routes.get("/org/farms/:id/forecast", async (c) => c.json(await farmForecast(c.var.sdb, c.req.param("id"))));

routes.get("/org/farms/:id/problem-areas", async (c) =>
  c.json(await farmProblemAreas(c.var.sdb, c.req.param("id"))),
);
routes.get("/org/farms/:id/eudr", async (c) => c.json(await farmEudr(c.var.sdb, c.req.param("id"))));
routes.get("/org/farms/:id/risk",async (c) => c.json(await farmRiskReport(c.var.sdb, c.req.param("id"))));

routes.patch("/org/farms/:id", async (c) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      department: z.string().max(60).nullish(),
      district: z.string().max(60).nullish(),
    }),
    await readJson(c.req),
  );
  await updateFarm(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
routes.delete("/org/farms/:id", async (c) => {
  await deleteFarm(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

routes.patch("/org/plots/:id", async (c) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      kind: z.enum(PLOT_KINDS).optional(),
      crop: z.enum(CROPS).nullish(),
      season: z.enum(SEASONS).nullish(),
      sowingDate: isoDate.nullish(),
      pastureType: z.string().max(60).nullish(),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .nullish(),
      geometry: plotArea.optional(),
    }),
    await readJson(c.req),
  );
  const { geometry, ...rest } = b;
  let geo = {};
  if (geometry !== undefined) {
    geo = { geometry: JSON.stringify(geometry), ...bboxOf(geometry), areaHa: areaHa(geometry) };
  }
  await updatePlot(c.var.sdb, c.req.param("id"), { ...rest, ...geo });
  if (!geometry) return c.json({ ok: true });
  // M-02: cambió la forma; devuelve la superficie nueva y avisos de superposición o de lote fuera del perímetro.
  return c.json({
    ok: true,
    areaHa: areaHa(geometry),
    warnings: await plotGeometryWarnings(c.var.sdb, c.req.param("id"), geometry),
  });
});
routes.delete("/org/plots/:id", async (c) => {
  await deletePlot(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
/** M-20: líneas del mapa (alambrados, caminos, cañerías). */
const lineGeometry = z.unknown().transform((g, ctx) => {
  const c = (g as { type?: string; coordinates?: unknown } | null)?.coordinates;
  const ok =
    (g as { type?: string } | null)?.type === "LineString" &&
    Array.isArray(c) &&
    c.length >= 2 &&
    c.length <= LIMITS.geometry.maxLineVertices &&
    c.every(
      (p) =>
        Array.isArray(p) &&
        typeof p[0] === "number" &&
        typeof p[1] === "number" &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    );
  if (!ok) {
    ctx.addIssue({ code: "custom", message: "geometría: línea inválida" });
    return z.NEVER;
  }
  return { type: "LineString" as const, coordinates: (c as number[][]).map((p) => [p[0]!, p[1]!]) };
});
routes.get("/org/farms/:id/lines", async (c) => c.json(await listFarmLines(c.var.sdb, c.req.param("id"))));
routes.post("/org/farms/:id/lines", async (c) => {
  const b = parse(
    z.object({ kind: z.enum(s.LINE_KINDS), name: z.string().trim().min(1).max(120), geometry: lineGeometry }),
    await readJson(c.req),
  );
  return c.json(await createLine(c.var.sdb, c.req.param("id"), b), 201);
});
routes.patch("/org/lines/:id", async (c) => {
  const b = parse(
    z.object({ kind: z.enum(s.LINE_KINDS).optional(), name: z.string().trim().min(1).max(120).optional() }),
    await readJson(c.req),
  );
  await updateLine(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
routes.delete("/org/lines/:id", async (c) => {
  await deleteLine(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

/** M-05: dividir un lote en dos. Los polígonos los calcula el cliente; el servidor valida forma y superficie. */
routes.post("/org/plots/:id/split", async (c) => {
  const b = parse(
    z.object({
      parts: z.tuple([
        z.object({ name: z.string().trim().min(1).max(120), geometry: plotArea }),
        z.object({ name: z.string().trim().min(1).max(120), geometry: plotArea }),
      ]),
    }),
    await readJson(c.req),
  );
  const res = await splitPlot(
    c.var.sdb,
    c.req.param("id"),
    b.parts.map((p) => ({ name: p.name, geometry: JSON.stringify(p.geometry), ...bboxOf(p.geometry), areaHa: areaHa(p.geometry) })),
  );
  return c.json(res, 201);
});
/** M-05: unir dos lotes contiguos de la misma estancia en uno. */
routes.post("/org/plots/merge", async (c) => {
  const b = parse(
    z.object({
      ids: z.tuple([z.string().min(1), z.string().min(1)]).refine(([x, y]) => x !== y),
      name: z.string().trim().min(1).max(120),
      geometry: plotArea,
    }),
    await readJson(c.req),
  );
  const res = await mergePlots(c.var.sdb, b.ids, {
    name: b.name,
    geometry: JSON.stringify(b.geometry),
    ...bboxOf(b.geometry),
    areaHa: areaHa(b.geometry),
  });
  return c.json(res, 201);
});
routes.get("/org/plots/:id/vigor-history", async (c) => c.json(await plotVigorHistory(c.var.sdb, c.req.param("id"))));
routes.get("/org/farms/:id/history", async (c) => c.json(await farmHistoryStatus(c.var.sdb, c.req.param("id"))));
/** F-14: campos propios de los formularios. Leer: todo el equipo (el empleado los llena en la app). Editar: dueño y administrador. */
