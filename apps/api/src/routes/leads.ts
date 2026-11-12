/**
 * Informe gratis de riesgo climático a cambio del email (V-04). Rutas públicas, sin sesión:
 * - POST /public/leads: guarda el pedido (email, punto en Paraguay, consentimiento explícito) y avisa al job.
 * - GET /public/leads/:id/:firma: el informe ya calculado. La firma es un HMAC del id; el enlace va en el email.
 * El cálculo lo hace workers-py (job lead_report) y lo sube por /ingest/leads/:id/report, que manda el email.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, newId, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getDb } from "../db/client";
import { dispatchJob, inBackground } from "../lib/dispatch";
import { hmacHex, hmacVerifyHex } from "../lib/crypto";
import { parse, readJson } from "../lib/http";
import type { AppEnv, Bindings } from "../types";

const DAY = 86_400_000;
export const LEAD_JOB = "lead_report";

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  lon: z.number().finite(),
  lat: z.number().finite(),
  consent: z.literal(true, { message: t("leads.consentRequired") }),
  /** Campo trampa: las personas no lo ven; si viene con algo, es un robot. */
  website: z.string().max(200).optional(),
});

const sign = (env: Pick<Bindings, "JWT_SECRET">, id: string) => hmacHex(env.JWT_SECRET, `lead:${id}`);

/** Enlace del informe para el email. */
export async function leadLink(env: Pick<Bindings, "JWT_SECRET" | "APP_URL">, id: string): Promise<string> {
  return `${env.APP_URL.replace(/\/$/, "")}/informe/${id}/${await sign(env, id)}`;
}

export const leads = new Hono<AppEnv>();

leads.post("/leads", async (c) => {
  const b = parse(body, await readJson(c.req));
  // Un robot que llenó el campo trampa recibe la misma respuesta y no deja nada guardado.
  if (b.website) return c.json({ ok: true });
  const box = LIMITS.leads.bbox;
  if (b.lon < box.minLon || b.lon > box.maxLon || b.lat < box.minLat || b.lat > box.maxLat)
    throw new HTTPException(400, { message: t("leads.outOfCountry") });
  const db = getDb(c.env.DB);
  const now = Date.now();
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const ipHash = ip ? await hmacHex(c.env.JWT_SECRET, `lead-ip:${ip}`) : null;
  if (ipHash) {
    const [{ n }] = (await db
      .select({ n: count() })
      .from(s.leads)
      .where(and(eq(s.leads.ipHash, ipHash), gte(s.leads.createdAt, now - DAY)))) as [{ n: number }];
    if (n >= LIMITS.leads.perIpPerDay) throw new HTTPException(429, { message: t("leads.tooMany") });
  }
  // Mismo email dentro del plazo: misma respuesta, sin pedido nuevo (no revela si ya había uno).
  const [recent] = await db
    .select({ id: s.leads.id })
    .from(s.leads)
    .where(and(eq(s.leads.email, b.email), gte(s.leads.createdAt, now - LIMITS.leads.emailCooldownMs)))
    .limit(1);
  if (recent) return c.json({ ok: true });
  await db.insert(s.leads).values({
    id: newId(),
    email: b.email,
    lon: Math.round(b.lon * 1e4) / 1e4,
    lat: Math.round(b.lat * 1e4) / 1e4,
    consentAt: now,
    consentVersion: LIMITS.leads.consentVersion,
    ipHash,
    createdAt: now,
  });
  // El job corre en GitHub Actions; sin token configurado lo levanta el cron diario.
  await inBackground(c, dispatchJob(c.env, LEAD_JOB, ""));
  return c.json({ ok: true });
});

leads.get("/leads/:id/:sig", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  const { id, sig } = c.req.param();
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await hmacVerifyHex(c.env.JWT_SECRET, `lead:${id}`, sig)))
    return c.json({ error: "Enlace inexistente" }, 404);
  const [row] = await getDb(c.env.DB)
    .select({ report: s.leads.report, reportAt: s.leads.reportAt })
    .from(s.leads)
    .where(eq(s.leads.id, id))
    .limit(1);
  if (!row?.report) return c.json({ error: "Enlace inexistente" }, 404);
  return c.json({ computedAt: row.reportAt, report: JSON.parse(row.report) });
});
