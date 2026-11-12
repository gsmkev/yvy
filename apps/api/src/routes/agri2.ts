/** Agricultura, segunda tanda (agri-p2): fenología, ventana de siembra, carencias, amortiguación, suelo, entregas. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { CROPS, LIMITS } from "@yvy/shared";
import { farmPlotForecast, farmSpiReport, farmSowingWindow, farmWithdrawal, plotPhenology, plotWaterBalance } from "../db/agri2";
import { createYieldMap, deleteYieldMap, listYieldMaps } from "../db/yield";
import { createDelivery, deleteDelivery, listDeliveries } from "../db/deliveries";
import { createSoilSample, deleteSoilSample, listSoilSamples, updateSoilSample } from "../db/soil";
import { parse, readJson } from "../lib/http";
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

// ---------- A-30: análisis de suelo ----------
const num = (min: number, max: number) => z.number().min(min).max(max).nullish();
const soilFields = {
  plotId: z.string().uuid().nullish(),
  pointLabel: z.string().trim().max(60).nullish(),
  lon: num(-180, 180),
  lat: num(-90, 90),
  sampledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  depthCm: z.number().int().min(1).max(300),
  lab: z.string().trim().max(120).nullish(),
  ph: num(2, 11),
  pMgKg: num(0, 2000),
  kCmolKg: num(0, 50),
  omPct: num(0, 60),
  note: z.string().trim().max(1000).nullish(),
};
const hasValue = (v: { ph?: unknown; pMgKg?: unknown; kCmolKg?: unknown; omPct?: unknown }) =>
  v.ph != null || v.pMgKg != null || v.kCmolKg != null || v.omPct != null;
const coordsTogether = (v: { lon?: unknown; lat?: unknown }) => (v.lon == null) === (v.lat == null);
const norm = (b: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, v === undefined ? undefined : v === "" ? null : (v ?? null)]),
  );

agri2.get("/farms/:id/soil-samples", async (c) => c.json(await listSoilSamples(c.var.sdb, c.req.param("id"))));

agri2.post("/farms/:id/soil-samples", async (c) => {
  const b = parse(
    z
      .object({ ...soilFields, depthCm: soilFields.depthCm.default(20) })
      .refine(hasValue, { message: "Cargá al menos un valor del análisis" })
      .refine(coordsTogether, { message: "Indicá longitud y latitud juntas" }),
    await readJson(c.req),
  );
  return c.json(
    await createSoilSample(c.var.sdb, c.req.param("id"), {
      plotId: b.plotId ?? null,
      pointLabel: b.pointLabel || null,
      lon: b.lon ?? null,
      lat: b.lat ?? null,
      sampledOn: b.sampledOn,
      depthCm: b.depthCm,
      lab: b.lab || null,
      ph: b.ph ?? null,
      pMgKg: b.pMgKg ?? null,
      kCmolKg: b.kCmolKg ?? null,
      omPct: b.omPct ?? null,
      note: b.note || null,
    }),
    201,
  );
});

agri2.patch("/soil-samples/:id", async (c) => {
  const b = parse(z.object(soilFields).partial().refine(coordsTogether, { message: "Indicá longitud y latitud juntas" }), await readJson(c.req));
  await updateSoilSample(c.var.sdb, c.req.param("id"), norm(b) as never);
  return c.json({ ok: true });
});

agri2.delete("/soil-samples/:id", async (c) => {
  await deleteSoilSample(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- A-23: entregas de grano a acopio ----------
agri2.get("/farms/:id/deliveries", async (c) => c.json(await listDeliveries(c.var.sdb, c.req.param("id"))));

agri2.post("/farms/:id/deliveries", async (c) => {
  const b = parse(
    z.object({
      plotId: z.string().uuid().nullish(),
      seasonId: z.string().uuid().nullish(),
      crop: z.enum(CROPS),
      ticket: z.string().trim().min(1).max(40),
      silo: z.string().trim().min(1).max(120),
      deliveredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      grossKg: z.number().positive().max(1_000_000),
      moisturePct: z.number().min(0).max(60).nullish(),
      baseMoisturePct: z.number().min(0).max(30),
      impuritiesPct: z.number().min(0).max(50).default(0),
      otherKg: z.number().min(0).max(1_000_000).default(0),
      note: z.string().trim().max(500).nullish(),
    }),
    await readJson(c.req),
  );
  return c.json(
    await createDelivery(c.var.sdb, c.req.param("id"), {
      ...b,
      plotId: b.plotId ?? null,
      seasonId: b.seasonId ?? null,
      moisturePct: b.moisturePct ?? null,
      note: b.note || null,
    }),
    201,
  );
});

agri2.delete("/deliveries/:id", async (c) => {
  await deleteDelivery(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

/** C-03: pronóstico por lote (solo estancias de más de 2.000 ha). */
agri2.get("/farms/:id/plot-forecast", async (c) => c.json(await farmPlotForecast(c.var.sdb, c.req.param("id"))));

/** C-07: índice de precipitación estandarizado (SPI) a 1, 3 y 6 meses. */
agri2.get("/farms/:id/spi", async (c) => c.json(await farmSpiReport(c.var.sdb, c.req.param("id"))));

// ---------- A-21: mapas de rendimiento de la cosechadora ----------
const yieldNum = z.number().min(0).max(1_000);
agri2.get("/plots/:id/yield-maps", async (c) => c.json(await listYieldMaps(c.var.sdb, c.req.param("id"))));

agri2.post("/plots/:id/yield-maps", async (c) => {
  const raw = await c.req.text();
  if (raw.length > LIMITS.yieldMap.maxBodyBytes) throw new HTTPException(413, { message: "El mapa es demasiado grande" });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HTTPException(400, { message: "JSON inválido" });
  }
  const b = parse(
    z.object({
      seasonId: z.string().uuid().nullish(),
      fileName: z.string().trim().min(1).max(200),
      nPoints: z.number().int().min(3).max(10_000_000),
      nDropped: z.number().int().min(0).max(10_000_000),
      meanTHa: yieldNum,
      p10THa: yieldNum,
      p90THa: yieldNum,
      minTHa: yieldNum,
      maxTHa: yieldNum,
      cvPct: z.number().min(0).max(1_000),
      cellM: z.number().int().min(1).max(5_000),
      cells: z
        .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), yieldNum, z.number().int().min(1)]))
        .min(1)
        .max(LIMITS.yieldMap.maxCells),
    }),
    json,
  );
  return c.json(await createYieldMap(c.var.sdb, c.req.param("id"), { ...b, seasonId: b.seasonId ?? null }), 201);
});

agri2.delete("/yield-maps/:id", async (c) => {
  await deleteYieldMap(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
