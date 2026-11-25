/** Avisos de fuego, riesgo climático, pedidos de informe y áreas problema. */
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { farmRiskSchema, LIMITS } from "@yvy/shared";
import { leadEmail, sendEmail } from "../../lib/email";
import { parse } from "../../lib/http";
import { leadLink } from "../leads";
import { type IngestEnv, json, max } from "./shared";
import { uuid } from "../schemas";
import { Hono } from "hono";

/** Rutas de ingesta de avisos de fuego, riesgo, pedidos de informe y áreas problema. */
export const routes = new Hono<IngestEnv>();

/** Aviso de fuego calculado por el job de FIRMS. */
routes.post("/fire-alerts", async (c) => {
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
routes.post("/farm-risk", async (c) => {
  const b = parse(z.object({ farmId: uuid, report: farmRiskSchema }), json(c.var.body));
  if (c.var.body.length > 30_000) throw new HTTPException(413, { message: "Informe demasiado grande" });
  if (!(await c.var.sys.upsertFarmRisk(b.farmId, JSON.stringify(b.report), Date.now())))
    throw new HTTPException(404, { message: "Estancia inexistente" });
  return c.json({ ok: true });
});

/** Pedidos del informe gratis pendientes (solo el punto: el email no sale de la base). */
routes.get("/leads", async (c) => c.json(await c.var.sys.pendingLeads(Date.now())));

/** Informe del pedido ya calculado. Se guarda y se manda por email con el enlace; si el envío falla queda para el próximo intento. */
routes.post("/leads/:id/report", async (c) => {
  const id = c.req.param("id");
  const b = parse(z.object({ report: farmRiskSchema }), json(c.var.body));
  if (c.var.body.length > 30_000) throw new HTTPException(413, { message: "Informe demasiado grande" });
  const now = Date.now();
  const lead = await c.var.sys.saveLeadReport(id, JSON.stringify(b.report), now);
  if (!lead) throw new HTTPException(404, { message: "Pedido inexistente" });
  try {
    const link = await leadLink(c.env, id);
    await sendEmail(c.env, lead.email, leadEmail({ link, days: Math.round(LIMITS.leads.retentionMs / 86_400_000) }));
    await c.var.sys.markLeadSent(id, now);
    return c.json({ ok: true, sent: true });
  } catch (e) {
    console.error("no se pudo mandar el informe gratis", e);
    return c.json({ ok: true, sent: false });
  }
});

/** Áreas problema de un lote (job s2_ingest): polígonos chicos ya calculados. */
routes.post("/problem-areas", async (c) => {
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
