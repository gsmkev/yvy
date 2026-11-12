/**
 * I-01: API pública de solo lectura, con tokens por organización (`Authorization: Bearer yvy_…`).
 * Pasa por ScopedDb como un administrador de solo lectura de la organización del token, así que ve lo mismo que la web
 * sin poder escribir. Documentación: /api-docs (web) y docs/API.md.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, RECORD_KINDS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { verifyApiToken } from "../db/api-tokens";
import { getDb } from "../db/client";
import { listAlerts, listRecords, farmSummaries } from "../db/queries";
import { ScopedDb } from "../db/scoped";
import type { AppEnv } from "../types";

export const v1 = new Hono<AppEnv>();

v1.use("*", async (c, next) => {
  if (c.req.method !== "GET") throw new HTTPException(405, { message: "La API pública es de solo lectura" });
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const db = getDb(c.env.DB);
  const found = token ? await verifyApiToken(db, token, Date.now()) : null;
  if (!found) throw new HTTPException(401, { message: "Token inválido o revocado" });
  c.header("X-RateLimit-Limit", String(LIMITS.api.perMinute));
  if (found.limited) {
    c.header("Retry-After", String(60 - (Math.floor(Date.now() / 1000) % 60)));
    throw new HTTPException(429, { message: "Demasiados pedidos; probá de nuevo en un minuto" });
  }
  const auth = { userId: `api:${found.id}`, orgId: found.orgId, role: "admin" as const, readOnly: true };
  c.set("auth", auth);
  c.set("sdb", new ScopedDb(db, auth));
  await next();
});

const geo = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};
const query = <T extends z.ZodType>(schema: T, c: { req: { query: () => Record<string, string> } }) => {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw new HTTPException(400, { message: `${r.error.issues[0]?.path.join(".")}: ${r.error.issues[0]?.message}` });
  return r.data as z.infer<T>;
};
const limitQ = z.coerce.number().int().min(1).max(LIMITS.api.maxPageSize).default(LIMITS.api.defaultPageSize);

v1.get("/farms", async (c) => {
  const rows = await farmSummaries(c.var.sdb);
  return c.json({
    data: rows.map((f) => ({
      id: f.id,
      name: f.name,
      department: f.department,
      areaHa: f.areaHa,
      centroid: { lon: f.centroidLon, lat: f.centroidLat },
      plots: Number(f.plots),
      activeAlerts: Number(f.activeAlerts),
      geometry: geo(f.geometry),
    })),
  });
});

v1.get("/plots", async (c) => {
  const q = query(z.object({ farmId: z.string().optional() }), c);
  const sdb = c.var.sdb;
  const rows = await sdb.db
    .select()
    .from(s.plots)
    .where(
      and(
        eq(s.plots.organizationId, sdb.auth.orgId),
        isNull(s.plots.deletedAt),
        sdb.workerFilter("plots"),
        q.farmId ? eq(s.plots.farmId, q.farmId) : undefined,
      ),
    )
    .orderBy(asc(s.plots.name))
    .limit(LIMITS.api.maxPageSize * 5);
  return c.json({
    data: rows.map((p) => ({
      id: p.id,
      farmId: p.farmId,
      name: p.name,
      kind: p.kind,
      crop: p.crop,
      season: p.season,
      sowingDate: p.sowingDate,
      areaHa: p.areaHa,
      geometry: geo(p.geometry),
    })),
  });
});

v1.get("/records", async (c) => {
  const q = query(
    z.object({
      farmId: z.string().optional(),
      plotId: z.string().optional(),
      kind: z.enum(RECORD_KINDS).optional(),
      from: z.coerce.number().int().optional(),
      to: z.coerce.number().int().optional(),
      limit: limitQ,
      cursor: z.string().regex(/^\d+\.[\w-]+$/).optional(),
    }),
    c,
  );
  const [at, ...id] = (q.cursor ?? "").split(".");
  const res = await listRecords(c.var.sdb, {
    farmId: q.farmId,
    plotId: q.plotId,
    kind: q.kind,
    from: q.from,
    to: q.to,
    limit: q.limit,
    cursor: q.cursor ? { capturedAt: Number(at), id: id.join(".") } : undefined,
  });
  return c.json({
    data: res.rows.map((r) => ({
      id: r.id,
      farmId: r.farmId,
      plotId: r.plotId,
      plotName: r.plotName,
      kind: r.kind,
      data: r.data,
      lon: r.lon,
      lat: r.lat,
      capturedAt: r.capturedAt,
      author: r.authorName,
      photos: r.attachments.length,
    })),
    nextCursor: res.nextCursor ? `${res.nextCursor.capturedAt}.${res.nextCursor.id}` : null,
  });
});

v1.get("/alerts", async (c) => {
  const q = query(z.object({ farmId: z.string().optional(), active: z.enum(["0", "1"]).optional() }), c);
  const rows = await listAlerts(c.var.sdb, { farmId: q.farmId, active: q.active === "1" });
  return c.json({
    data: rows.map(({ alert: a }) => ({
      id: a.id,
      farmId: a.farmId,
      kind: a.kind,
      severity: a.severity,
      summary: a.summary,
      source: a.source,
      validFrom: a.validFrom,
      validTo: a.validTo,
      resolvedAt: a.resolvedAt,
    })),
  });
});
