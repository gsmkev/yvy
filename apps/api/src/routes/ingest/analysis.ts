/** EUDR, focos de calor, análisis, parte semanal, SPI y zonas de manejo. */
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { ANALYSIS_KINDS } from "@yvy/shared/schema";
import { farmSpiSchema } from "@yvy/shared";
import { parse } from "../../lib/http";
import { type IngestEnv, json } from "./shared";
import { uuid, isoDate } from "../schemas";
import { Hono } from "hono";

export const routes = new Hono<IngestEnv>();

/** Indicador EUDR de un lote (job eudr, S-30): ya viene calculado; el Worker valida la forma y lo guarda. */
routes.post("/eudr", async (c) => {
  if (c.var.body.length > 80_000) throw new HTTPException(413, { message: "Resultado demasiado grande" });
  const pos = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
  const ms = z.number().int().nullable();
  const b = parse(
    z.object({
      plotId: uuid,
      status: z.enum(["no_change", "possible_loss", "no_data"]),
      plotAreaHa: z.number().min(0).max(1_000_000),
      forestRefHa: z.number().min(0).max(1_000_000),
      lossHa: z.number().min(0).max(1_000_000),
      validPct: z.number().min(0).max(100),
      refYear: z.number().int().min(2018).max(2100),
      curYear: z.number().int().min(2018).max(2100),
      refFromAt: ms,
      refToAt: ms,
      curFromAt: ms,
      curToAt: ms,
      refScenes: z.number().int().min(0).max(1000),
      curScenes: z.number().int().min(0).max(1000),
      changes: z
        .array(
          z.object({
            geometry: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(pos).min(4).max(300)).min(1).max(4) }),
            areaHa: z.number().positive().max(100_000),
          }),
        )
        .max(20),
    }),
    json(c.var.body),
  );
  const { plotId, changes, ...rest } = b;
  const fc = {
    type: "FeatureCollection",
    features: changes.map((a) => ({ type: "Feature", properties: { areaHa: a.areaHa }, geometry: a.geometry })),
  };
  if (!(await c.var.sys.upsertEudrResult(plotId, { ...rest, changes: JSON.stringify(fc) })))
    throw new HTTPException(404, { message: "Lote inexistente" });
  return c.json({ ok: true });
});


/** Focos de calor guardados cerca de la estancia (job burned_area, S-20). */
routes.get("/farms/:id/hotspots", async (c) => {
  const q = parse(z.object({ days: z.coerce.number().int().min(1).max(400).default(120) }), c.req.query());
  const res = await c.var.sys.farmHotspots(c.req.param("id"), Date.now() - q.days * 86_400_000);
  if (!res) throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json(res);
});

/** El job de un análisis a demanda (cover_change) termina o falla. */
routes.post("/farms/:id/analysis-status", async (c) => {
  const b = parse(z.object({ kind: z.enum(ANALYSIS_KINDS), status: z.enum(["done", "failed"]) }), json(c.var.body));
  if (!(await c.var.sys.setAnalysisStatus(c.req.param("id"), b.kind, b.status))) throw new HTTPException(404);
  return c.json({ ok: true });
});

const pct = z.number().min(0).max(100);
const ha = z.number().min(0).max(1_000_000);
const classHa = z.object({ forest: ha, pasture: ha, crop: ha, other: ha });
const metricsByKind = {
  burned: z.object({ eventAt: z.number().int(), burnedHa: ha, highHa: ha, hotspots: z.number().int().min(0).max(100_000) }),
  cover_change: z.object({
    from: classHa,
    to: classHa,
    forestToPasture: ha,
    forestToCrop: ha,
    forestToOther: ha,
  }),
} as const;

/** Análisis de un lote (jobs burned_area y cover_change): ya viene calculado; el Worker valida la forma y lo guarda. */
routes.post("/analyses", async (c) => {
  if (c.var.body.length > 80_000) throw new HTTPException(413, { message: "Resultado demasiado grande" });
  const pos = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
  const b = parse(
    z.object({
      plotId: uuid,
      kind: z.enum(ANALYSIS_KINDS),
      refKey: z.string().min(1).max(40),
      fromAt: z.number().int().nullable(),
      toAt: z.number().int().nullable(),
      plotAreaHa: ha,
      validPct: pct,
      metrics: z.unknown(),
      changes: z
        .array(
          z.object({
            geometry: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(pos).min(4).max(300)).min(1).max(4) }),
            areaHa: z.number().positive().max(100_000),
            severity: z.enum(["moderate", "high"]).optional(),
          }),
        )
        .max(30),
    }),
    json(c.var.body),
  );
  const metrics = parse(metricsByKind[b.kind], b.metrics);
  const fc = {
    type: "FeatureCollection",
    features: b.changes.map((a) => ({
      type: "Feature",
      properties: { areaHa: a.areaHa, ...(a.severity ? { severity: a.severity } : {}) },
      geometry: a.geometry,
    })),
  };
  const ok = await c.var.sys.upsertAnalysis(b.plotId, {
    kind: b.kind,
    refKey: b.refKey,
    fromAt: b.fromAt,
    toAt: b.toAt,
    plotAreaHa: b.plotAreaHa,
    validPct: b.validPct,
    metrics: JSON.stringify(metrics),
    changes: JSON.stringify(fc),
  });
  if (!ok) throw new HTTPException(404, { message: "Lote inexistente" });
  return c.json({ ok: true });
});

/** Datos del parte semanal (job weekly_report): agregados de la semana, sin registros ni personas. */
routes.get("/farms/:id/weekly-summary", async (c) => {
  const q = parse(z.object({ from: isoDate, to: isoDate }), c.req.query());
  const res = await c.var.sys.weeklySummary(c.req.param("id"), q.from, q.to);
  if (!res) throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json(res);
});

/** El job ya subió el PDF a R2: queda registrado para adjuntarlo al email del lunes. */
routes.post("/weekly-reports", async (c) => {
  const b = parse(
    z.object({
      farmId: uuid,
      periodStart: isoDate,
      periodEnd: isoDate,
      storagePath: z.string().max(300).regex(/^reports\/[\w./-]+\.pdf$/),
    }),
    json(c.var.body),
  );
  if (!(await c.var.sys.saveWeeklyReport(b.farmId, b.periodStart, b.periodEnd, b.storagePath, Date.now())))
    throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json({ ok: true }, 201);
});

/** C-07: lluvia diaria de la estancia (CHIRPS) para que el job calcule el SPI. */
routes.get("/farms/:id/precip", async (c) => {
  const q = parse(z.object({ from: isoDate }), c.req.query());
  return c.json(await c.var.sys.farmPrecip(c.req.param("id"), q.from));
});

/** SPI a 1, 3 y 6 meses (job spi, C-07): ya viene calculado; el Worker valida la forma y lo guarda. */
routes.post("/farm-spi", async (c) => {
  const b = parse(z.object({ farmId: uuid, report: farmSpiSchema }), json(c.var.body));
  if (c.var.body.length > 5_000) throw new HTTPException(413, { message: "Informe demasiado grande" });
  if (!(await c.var.sys.upsertFarmSpi(b.farmId, JSON.stringify(b.report), Date.now())))
    throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json({ ok: true });
});

/** Zonas de manejo de un lote (job mgmt_zones, A-32): ya vienen calculadas; el Worker valida la forma y las guarda. */
routes.post("/management-zones", async (c) => {
  if (c.var.body.length > 150_000) throw new HTTPException(413, { message: "Resultado demasiado grande" });
  const pos = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
  const ring = z.array(pos).min(4).max(400);
  const b = parse(
    z.object({
      plotId: uuid,
      seasons: z.array(z.number().int().min(2015).max(2100)).min(2).max(6),
      zones: z
        .array(
          z.object({
            zone: z.number().int().min(1).max(3),
            areaHa: z.number().positive().max(1_000_000),
            pct: z.number().min(0).max(100),
            meanNdvi: z.number().min(-1).max(1),
            geometry: z.object({
              type: z.literal("MultiPolygon"),
              coordinates: z.array(z.array(ring).min(1).max(20)).min(1).max(15),
            }),
          }),
        )
        .min(1)
        .max(3),
    }),
    json(c.var.body),
  );
  if (new Set(b.zones.map((x) => x.zone)).size !== b.zones.length)
    throw new HTTPException(400, { message: "Zonas repetidas" });
  const written = await c.var.sys.replaceManagementZones(
    b.plotId,
    b.seasons,
    b.zones.map((x) => ({ ...x, geometry: JSON.stringify(x.geometry) })),
  );
  if (written === null) throw new HTTPException(404, { message: "Lote inexistente" });
  return c.json({ written });
});
