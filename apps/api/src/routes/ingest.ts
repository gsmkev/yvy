/**
 * Entrada de los jobs Python que corren en GitHub Actions (PRD-cloudflare §4.6).
 * Firma: X-Yvy-Signature = hex(HMAC-SHA256(INGEST_SECRET, `${timestamp}.${METHOD}.${path}.${body}`)),
 * X-Yvy-Timestamp en epoch ms, tolerancia LIMITS.ingest.maxSkewMs. Lotes de ≤ 40 filas.
 */
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { ANALYSIS_KINDS, INDEX_KINDS, LAYERS } from "@yvy/shared/schema";
import { farmRiskSchema, farmSpiSchema, LIMITS } from "@yvy/shared";
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

/** Última fecha cargada por estancia y fuente (para que los jobs bajen solo lo que falta). */
ingest.get("/climate-latest", async (c) => c.json(await c.var.sys.climateLatest()));

/** A-31: análisis de suelo con coordenadas para el job fertility_maps. */
ingest.get("/farms/:id/soil-points", async (c) => c.json(await c.var.sys.soilPoints(c.req.param("id"))));

ingest.get("/farms/:id/geometry", async (c) => {
  const [row] = await c.var.sys.farmGeometry(c.req.param("id"));
  if (!row) throw new HTTPException(404);
  return c.json({ farm: JSON.parse(row.farm), plots: JSON.parse(row.plots) });
});

/** El job new_farm avisa que empezó (processing) o que el mapa base falló (failed). `ready` lo pone /farm-layers. */
ingest.post("/farms/:id/imagery-status", async (c) => {
  const b = parse(z.object({ status: z.enum(["pending", "processing", "failed"]) }), json(c.var.body));
  if (!(await c.var.sys.setImageryStatus(c.req.param("id"), b.status))) throw new HTTPException(404);
  return c.json({ ok: true });
});

/** S-03: el job s2_history termina; solo cambia el estado de un pedido existente. */
ingest.post("/farms/:id/history-status", async (c) => {
  const b = parse(z.object({ status: z.enum(["done", "failed"]) }), json(c.var.body));
  if (!(await c.var.sys.setHistoryStatus(c.req.param("id"), b.status))) throw new HTTPException(404);
  return c.json({ ok: true });
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
  return c.json(await c.var.sys.upsertScene(b));
});

ingest.post("/scenes/:id/processed", async (c) => {
  await c.var.sys.markSceneProcessed(c.req.param("id"));
  return c.json({ ok: true });
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

/** M-17: GeoTIFF por convertir de una estancia (job custom_layers). */
ingest.get("/farms/:id/custom-layers-pending", async (c) => c.json(await c.var.sys.pendingCustomLayers(c.req.param("id"))));

/** M-17: el job termina una capa: PNG georreferenciado en R2 con sus 4 esquinas, o fallo. */
ingest.post("/custom-layers/:id/result", async (c) => {
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
ingest.post("/climatology", async (c) => {
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

/** Aviso de fuego calculado por el job de FIRMS (anexo §4.8). */
ingest.post("/fire-alerts", async (c) => {
  const b = parse(
    z.object({
      farmId: uuid,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      severity: z.enum(["watch", "warning"]),
      minDistanceKm: z.number().min(0),
      windTowardsFarm: z.boolean().optional(),
      hotspots: z
        .array(
          z.object({
            lon: z.number(),
            lat: z.number(),
            acquiredAt: z.number().int(),
            confidence: z.string().nullable(),
            frp: z.number().nullable(),
            source: z.string(),
          }),
        )
        .max(max),
    }),
    json(c.var.body),
  );
  const res = await c.var.sys.fireAlert(b);
  if (!res) throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json(res);
});

/** Informe de riesgo climático (job risk_report): ya viene calculado, el Worker solo valida la forma y lo guarda. */
ingest.post("/farm-risk", async (c) => {
  const b = parse(z.object({ farmId: uuid, report: farmRiskSchema }), json(c.var.body));
  if (c.var.body.length > 30_000) throw new HTTPException(413, { message: "Informe demasiado grande" });
  if (!(await c.var.sys.upsertFarmRisk(b.farmId, JSON.stringify(b.report), Date.now())))
    throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json({ ok: true });
});

/** Áreas problema de un lote (job s2_ingest, S-08): polígonos chicos ya calculados. */
ingest.post("/problem-areas", async (c) => {
  const pos = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
  const b = parse(
    z.object({
      plotId: uuid,
      acquiredAt: z.number().int(),
      areas: z
        .array(
          z.object({
            geometry: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(pos).min(4).max(300)).min(1).max(4) }),
            areaHa: z.number().positive().max(100_000),
            lon: z.number().min(-180).max(180),
            lat: z.number().min(-90).max(90),
            meanNdvi: z.number().min(-1).max(1),
            plotMedianNdvi: z.number().min(-1).max(1),
          }),
        )
        .max(10),
    }),
    json(c.var.body),
  );
  const written = await c.var.sys.replaceProblemAreas(
    b.plotId,
    b.acquiredAt,
    b.areas.map(({ geometry, ...a }) => ({ ...a, geometry: JSON.stringify(geometry) })),
  );
  if (written === null) throw new HTTPException(404, { message: "Lote inexistente" });
  return c.json({ written });
});

/** Indicador EUDR de un lote (job eudr, S-30): ya viene calculado; el Worker valida la forma y lo guarda. */
ingest.post("/eudr", async (c) => {
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

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Focos de calor guardados cerca de la estancia (job burned_area, S-20). */
ingest.get("/farms/:id/hotspots", async (c) => {
  const q = parse(z.object({ days: z.coerce.number().int().min(1).max(400).default(120) }), c.req.query());
  const res = await c.var.sys.farmHotspots(c.req.param("id"), Date.now() - q.days * 86_400_000);
  if (!res) throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json(res);
});

/** El job de un análisis a demanda (cover_change) termina o falla. */
ingest.post("/farms/:id/analysis-status", async (c) => {
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
ingest.post("/analyses", async (c) => {
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
ingest.get("/farms/:id/weekly-summary", async (c) => {
  const q = parse(z.object({ from: isoDay, to: isoDay }), c.req.query());
  const res = await c.var.sys.weeklySummary(c.req.param("id"), q.from, q.to);
  if (!res) throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json(res);
});

/** El job ya subió el PDF a R2: queda registrado para adjuntarlo al email del lunes. */
ingest.post("/weekly-reports", async (c) => {
  const b = parse(
    z.object({
      farmId: uuid,
      periodStart: isoDay,
      periodEnd: isoDay,
      storagePath: z.string().max(300).regex(/^reports\/[\w./-]+\.pdf$/),
    }),
    json(c.var.body),
  );
  if (!(await c.var.sys.saveWeeklyReport(b.farmId, b.periodStart, b.periodEnd, b.storagePath, Date.now())))
    throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json({ ok: true }, 201);
});

/** C-07: lluvia diaria de la estancia (CHIRPS) para que el job calcule el SPI. */
ingest.get("/farms/:id/precip", async (c) => {
  const q = parse(z.object({ from: isoDay }), c.req.query());
  return c.json(await c.var.sys.farmPrecip(c.req.param("id"), q.from));
});

/** SPI a 1, 3 y 6 meses (job spi, C-07): ya viene calculado; el Worker valida la forma y lo guarda. */
ingest.post("/farm-spi", async (c) => {
  const b = parse(z.object({ farmId: uuid, report: farmSpiSchema }), json(c.var.body));
  if (c.var.body.length > 5_000) throw new HTTPException(413, { message: "Informe demasiado grande" });
  if (!(await c.var.sys.upsertFarmSpi(b.farmId, JSON.stringify(b.report), Date.now())))
    throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json({ ok: true });
});

/** Zonas de manejo de un lote (job mgmt_zones, A-32): ya vienen calculadas; el Worker valida la forma y las guarda. */
ingest.post("/management-zones", async (c) => {
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
