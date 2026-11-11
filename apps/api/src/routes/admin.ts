/**
 * Panel interno (PRD Fase 8): métricas de la sección 4 y gestión del plan. Solo para los emails de
 * ADMIN_EMAILS. Acceso de sistema (todas las organizaciones).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { planLimits } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getDb } from "../db/client";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

export const admin = new Hono<AppEnv>();

admin.use("*", async (c, next) => {
  const allowed = (c.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const [u] = await getDb(c.env.DB)
    .select({ email: s.users.email })
    .from(s.users)
    .where(eq(s.users.id, c.var.auth.userId))
    .limit(1);
  if (!u?.email || !allowed.includes(u.email.toLowerCase()))
    throw new HTTPException(403, { message: "Solo para el equipo de Yvy" });
  await next();
});

admin.get("/metrics", async (c) => {
  const db = getDb(c.env.DB);
  const now = Date.now();
  const week = now - 7 * 86_400_000;
  const weekDay = new Date(week - 3 * 3_600_000).toISOString().slice(0, 10);
  const orgs = await db.all<Record<string, unknown>>(sql`
    SELECT o.id, o.name, o.plan, o.trial_ends_at AS trialEndsAt, o.max_ha AS maxHaOwn, o.max_users AS maxUsersOwn, o.created_at AS createdAt,
      (SELECT count(*) FROM farms f WHERE f.organization_id = o.id AND f.deleted_at IS NULL) AS farms,
      (SELECT coalesce(sum(area_ha), 0) FROM farms f WHERE f.organization_id = o.id AND f.deleted_at IS NULL) AS ha,
      (SELECT count(*) FROM memberships m WHERE m.organization_id = o.id AND m.role = 'worker' AND m.deleted_at IS NULL) AS workers,
      (SELECT count(*) FROM memberships m WHERE m.organization_id = o.id AND m.deleted_at IS NULL AND m.status = 'active') AS users,
      (SELECT count(*) FROM records r WHERE r.organization_id = o.id AND r.deleted_at IS NULL AND r.created_at >= ${week}) AS records7d,
      (SELECT count(DISTINCT r.author_id) FROM records r JOIN memberships m ON m.user_id = r.author_id AND m.organization_id = r.organization_id
         WHERE r.organization_id = o.id AND m.role = 'worker' AND r.created_at >= ${week}) AS activeWorkers7d,
      (SELECT count(*) FROM records r JOIN memberships m ON m.user_id = r.author_id AND m.organization_id = r.organization_id
         WHERE r.organization_id = o.id AND m.role = 'worker' AND r.deleted_at IS NULL AND r.created_at >= ${week}) AS workerRecords7d,
      (SELECT count(*) FROM memberships m WHERE m.organization_id = o.id AND m.role IN ('owner','admin') AND m.deleted_at IS NULL) AS owners,
      (SELECT count(*) FROM (SELECT a.user_id FROM activity_daily a WHERE a.organization_id = o.id AND a.role IN ('owner','admin') AND a.day >= ${weekDay}
         GROUP BY a.user_id HAVING count(*) >= 2)) AS ownersActive2x,
      (SELECT count(*) FROM alert_feedback af JOIN alerts al ON al.id = af.alert_id WHERE al.organization_id = o.id) AS feedback,
      (SELECT count(*) FROM alert_feedback af JOIN alerts al ON al.id = af.alert_id WHERE al.organization_id = o.id AND af.useful = 1) AS useful,
      (SELECT max(day) FROM activity_daily a WHERE a.organization_id = o.id) AS lastActive
    FROM organizations o ORDER BY o.created_at DESC`);
  const usage = await db.all(
    sql`SELECT metric, value, "limit" FROM usage_daily WHERE day = (SELECT max(day) FROM usage_daily)`,
  );
  return c.json({
    generatedAt: now,
    organizations: orgs.map((o) => ({
      ...o,
      limits: planLimits(String(o.plan), { maxHa: o.maxHaOwn as number | null, maxUsers: o.maxUsersOwn as number | null }),
      recordsPerActiveWorker: Number(o.activeWorkers7d) ? Number(o.workerRecords7d) / Number(o.activeWorkers7d) : null,
      ownersActivePct: Number(o.owners) ? (100 * Number(o.ownersActive2x)) / Number(o.owners) : null,
      usefulPct: Number(o.feedback) ? (100 * Number(o.useful)) / Number(o.feedback) : null,
    })),
    usage,
  });
});

admin.post("/orgs/:id/plan", async (c) => {
  const b = parse(
    z.object({
      plan: z.enum(["trial", "active", "blocked", "demo"]),
      trialEndsAt: z.number().int().nullish(),
      /** P-10: topes propios; null borra el tope propio y vuelve al del plan; sin el campo no se toca. */
      maxHa: z.number().positive().max(10_000_000).nullish(),
      maxUsers: z.number().int().positive().max(100_000).nullish(),
    }),
    await readJson(c.req),
  );
  await getDb(c.env.DB)
    .update(s.organizations)
    .set({
      plan: b.plan,
      ...(b.trialEndsAt !== undefined ? { trialEndsAt: b.trialEndsAt } : {}),
      ...(b.maxHa !== undefined ? { maxHa: b.maxHa } : {}),
      ...(b.maxUsers !== undefined ? { maxUsers: b.maxUsers } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(s.organizations.id, c.req.param("id")));
  return c.json({ ok: true });
});
