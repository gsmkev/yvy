/**
 * Panel interno (PRD Fase 8): métricas de la sección 4 y gestión del plan. Solo para los emails de
 * ADMIN_EMAILS. Acceso de sistema (todas las organizaciones).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { FUNNEL_EVENTS, LIMITS, localDate, newId, planLimits } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getDb } from "../db/client";
import { signJwt } from "../lib/crypto";
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

const audit = (c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }, action: string, orgId: string | null, detail: object) =>
  getDb(c.env.DB)
    .insert(s.auditLog)
    .values({
      id: newId(),
      actorUserId: c.var.auth.userId,
      action,
      organizationId: orgId,
      detail: JSON.stringify(detail),
      createdAt: Date.now(),
    });

/** Duración de la sesión de soporte. No se renueva: pasado este tiempo hay que volver a pedirla (y queda otra entrada en la auditoría). */
const SUPPORT_TTL_SECONDS = 30 * 60;
const like = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

admin.get("/metrics", async (c) => {
  const db = getDb(c.env.DB);
  // P-12: buscar por nombre de la organización, id o email de algún miembro
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const search = q
    ? sql`WHERE o.name LIKE ${like(q)} ESCAPE '\\' OR o.id = ${q} OR o.id IN (SELECT m.organization_id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email LIKE ${like(q)} ESCAPE '\\')`
    : sql``;
  const now = Date.now();
  const week = now - 7 * 86_400_000;
  const weekDay = new Date(week - 3 * 3_600_000).toISOString().slice(0, 10);
  const orgs = await db.all<Record<string, unknown>>(sql`
    SELECT o.id, o.name, o.plan, o.trial_ends_at AS trialEndsAt, o.max_ha AS maxHaOwn, o.max_users AS maxUsersOwn, o.created_at AS createdAt, o.referred_by AS referredBy, o.referrer_user_id AS referrerUserId, o.referral_credited_at AS referralCreditedAt,
      (SELECT u.full_name FROM users u WHERE u.id = o.referrer_user_id) AS referrerName,
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
    FROM organizations o ${search} ORDER BY o.created_at DESC`);
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
  await audit(c, "plan_changed", c.req.param("id"), b);
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

/** V-06: anotar (o quitar) el crédito del referido de una organización. Solo si se registró con el código de alguien. */
admin.post("/orgs/:id/referral-credit", async (c) => {
  const b = parse(z.object({ credited: z.boolean() }), await readJson(c.req));
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const [o] = await db
    .select({ referrer: s.organizations.referrerUserId })
    .from(s.organizations)
    .where(eq(s.organizations.id, id))
    .limit(1);
  if (!o) throw new HTTPException(404, { message: "No existe" });
  if (!o.referrer) throw new HTTPException(400, { message: "Esta organización no llegó por el código de nadie" });
  await audit(c, "referral_credit", id, { credited: b.credited, referrer: o.referrer });
  await db
    .update(s.organizations)
    .set({ referralCreditedAt: b.credited ? Date.now() : null, updatedAt: Date.now() })
    .where(eq(s.organizations.id, id));
  return c.json({ ok: true });
});

/** P-12: extender la prueba N días desde hoy o desde el fin actual, lo que sea posterior. Reactiva una prueba vencida o bloqueada. */
admin.post("/orgs/:id/extend-trial", async (c) => {
  const b = parse(z.object({ days: z.number().int().min(1).max(365) }), await readJson(c.req));
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const [o] = await db
    .select({ plan: s.organizations.plan, trialEndsAt: s.organizations.trialEndsAt })
    .from(s.organizations)
    .where(eq(s.organizations.id, id))
    .limit(1);
  if (!o) throw new HTTPException(404, { message: "No existe" });
  if (o.plan === "active" || o.plan === "demo")
    throw new HTTPException(400, { message: "Esta organización no está en prueba" });
  const now = Date.now();
  const trialEndsAt = Math.max(now, o.trialEndsAt ?? 0) + b.days * 86_400_000;
  await audit(c, "trial_extended", id, { days: b.days, from: o.trialEndsAt, to: trialEndsAt });
  await db.update(s.organizations).set({ plan: "trial", trialEndsAt, updatedAt: now }).where(eq(s.organizations.id, id));
  return c.json({ ok: true, trialEndsAt });
});

/**
 * P-12: "ver como soporte". Emite un access token de 30 min, sin refresh, a nombre del dueño de la organización y
 * marcado de solo lectura (requireAuth rechaza todo lo que no sea GET). Cada pedido deja una fila en audit_log.
 */
admin.post("/orgs/:id/support-session", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const [row] = await db
    .select({
      userId: s.users.id,
      fullName: s.users.fullName,
      email: s.users.email,
      orgName: s.organizations.name,
    })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .innerJoin(s.organizations, eq(s.organizations.id, s.memberships.organizationId))
    .where(
      and(
        eq(s.memberships.organizationId, id),
        eq(s.memberships.role, "owner"),
        eq(s.memberships.status, "active"),
        isNull(s.memberships.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "La organización no tiene dueño activo" });
  await audit(c, "support_session", id, { asUser: row.userId, ttlSeconds: SUPPORT_TTL_SECONDS });
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SUPPORT_TTL_SECONDS;
  const accessToken = await signJwt(c.env.JWT_SECRET, {
    sub: row.userId,
    org: id,
    role: "owner",
    iat,
    exp,
    ro: true,
    sup: c.var.auth.userId,
  });
  const organization = { id, name: row.orgName, role: "owner" as const };
  return c.json({
    accessToken,
    accessTokenExpiresAt: exp * 1000,
    refreshToken: "",
    refreshTokenExpiresAt: exp * 1000,
    user: { id: row.userId, fullName: row.fullName, email: row.email },
    organization,
    organizations: [organization],
  });
});

/** P-12: últimas acciones del equipo (opcionalmente de una organización); con `scope=org`, los cambios que hicieron las personas de esa organización (K-06). */
admin.get("/audit", async (c) => {
  const org = c.req.query("orgId");
  const rows = await getDb(c.env.DB)
    .select({
      id: s.auditLog.id,
      action: s.auditLog.action,
      organizationId: s.auditLog.organizationId,
      entity: s.auditLog.entity,
      entityId: s.auditLog.entityId,
      detail: s.auditLog.detail,
      createdAt: s.auditLog.createdAt,
      actor: s.users.email,
    })
    .from(s.auditLog)
    .leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId))
    .where(
      and(
        org ? eq(s.auditLog.organizationId, org) : undefined,
        c.req.query("scope") === "org" ? sql`${s.auditLog.entity} IS NOT NULL` : sql`${s.auditLog.entity} IS NULL`,
      ),
    )
    .orderBy(desc(s.auditLog.createdAt))
    .limit(100);
  return c.json(rows);
});

/**
 * P-03: embudo de activación de las organizaciones que se registraron en los últimos `days` días (por defecto 90):
 * cuántas llegaron a cada paso, las pantallas más abiertas en el mismo período (conteos diarios estimados, sin personas)
 * y el total de pantallas abiertas por día en las últimas dos semanas.
 */
admin.get("/funnel", async (c) => {
  const days = Math.min(3650, Math.max(1, Number(c.req.query("days")) || 90));
  const since = Date.now() - days * 86_400_000;
  const db = getDb(c.env.DB);
  const steps = await db.all<{ name: string; orgs: number }>(sql`
    SELECT name, count(DISTINCT organization_id) AS orgs FROM events
    WHERE organization_id IN (SELECT organization_id FROM events WHERE name = 'signup' AND ts >= ${since})
      AND name IN (${sql.join(FUNNEL_EVENTS.map((n) => sql`${n}`), sql`, `)})
    GROUP BY name`);
  const byName = new Map(steps.map((r) => [r.name, Number(r.orgs)]));
  const views = await db.all<{ name: string; n: number }>(sql`
    SELECT name, sum(n) AS n FROM events_daily
    WHERE day >= ${localDate(since)} GROUP BY name ORDER BY n DESC LIMIT 15`);
  const daily = await db.all<{ day: string; n: number }>(sql`
    SELECT day, sum(n) AS n FROM events_daily WHERE day >= ${localDate(Date.now() - 13 * 86_400_000)} GROUP BY day ORDER BY day`);
  return c.json({
    days,
    steps: FUNNEL_EVENTS.map((name) => ({ name, orgs: byName.get(name) ?? 0 })),
    views: views.map((v) => ({ name: v.name, n: Number(v.n) })),
    daily: daily.map((d) => ({ day: d.day, n: Number(d.n) })),
  });
});

/** P-10: pedidos de cambio de plan de las organizaciones. `status=pending` (por defecto) o `all` (los últimos 50). */
admin.get("/plan-requests", async (c) => {
  const all = c.req.query("status") === "all";
  const rows = await getDb(c.env.DB)
    .select({
      id: s.planRequests.id,
      organizationId: s.planRequests.organizationId,
      organization: s.organizations.name,
      currentPlan: s.organizations.plan,
      plan: s.planRequests.plan,
      maxHa: s.planRequests.maxHa,
      maxUsers: s.planRequests.maxUsers,
      note: s.planRequests.note,
      status: s.planRequests.status,
      createdAt: s.planRequests.createdAt,
      resolvedAt: s.planRequests.resolvedAt,
      resolutionNote: s.planRequests.resolutionNote,
      requester: s.users.fullName,
    })
    .from(s.planRequests)
    .innerJoin(s.organizations, eq(s.organizations.id, s.planRequests.organizationId))
    .leftJoin(s.users, eq(s.users.id, s.planRequests.requestedBy))
    .where(all ? undefined : eq(s.planRequests.status, "pending"))
    .orderBy(desc(s.planRequests.createdAt))
    .limit(50);
  return c.json(rows);
});

/**
 * P-10: aprueba un pedido pendiente: la organización pasa al plan pedido y se fijan los topes que pidió (o los que el
 * equipo corrija en el cuerpo). Todo en un batch, con su fila de auditoría. No cobra: el cobro es P-11.
 */
admin.post("/plan-requests/:id/approve", async (c) => {
  const b = parse(
    z.object({
      maxHa: z.number().positive().max(10_000_000).nullish(),
      maxUsers: z.number().int().positive().max(100_000).nullish(),
    }),
    await readJson(c.req),
  );
  const db = getDb(c.env.DB);
  const [r] = await db.select().from(s.planRequests).where(eq(s.planRequests.id, c.req.param("id"))).limit(1);
  if (!r) throw new HTTPException(404, { message: "No existe" });
  if (r.status !== "pending") throw new HTTPException(409, { message: "Ese pedido ya está resuelto" });
  const now = Date.now();
  const maxHa = b.maxHa === undefined ? r.maxHa : b.maxHa;
  const maxUsers = b.maxUsers === undefined ? r.maxUsers : b.maxUsers;
  await db.batch([
    db
      .update(s.organizations)
      .set({
        plan: r.plan,
        trialEndsAt: null,
        ...(maxHa !== null ? { maxHa } : {}),
        ...(maxUsers !== null ? { maxUsers } : {}),
        updatedAt: now,
      })
      .where(eq(s.organizations.id, r.organizationId)),
    db
      .update(s.planRequests)
      .set({ status: "approved", resolvedAt: now, resolvedBy: c.var.auth.userId })
      .where(and(eq(s.planRequests.id, r.id), eq(s.planRequests.status, "pending"))),
    audit(c, "plan_request_approved", r.organizationId, { requestId: r.id, plan: r.plan, maxHa, maxUsers }),
  ]);
  return c.json({ ok: true });
});

admin.post("/plan-requests/:id/reject", async (c) => {
  const b = parse(z.object({ note: z.string().trim().max(500).nullish() }), await readJson(c.req));
  const db = getDb(c.env.DB);
  const [r] = await db.select().from(s.planRequests).where(eq(s.planRequests.id, c.req.param("id"))).limit(1);
  if (!r) throw new HTTPException(404, { message: "No existe" });
  if (r.status !== "pending") throw new HTTPException(409, { message: "Ese pedido ya está resuelto" });
  await db.batch([
    db
      .update(s.planRequests)
      .set({ status: "rejected", resolvedAt: Date.now(), resolvedBy: c.var.auth.userId, resolutionNote: b.note ?? null })
      .where(and(eq(s.planRequests.id, r.id), eq(s.planRequests.status, "pending"))),
    audit(c, "plan_request_rejected", r.organizationId, { requestId: r.id, note: b.note ?? null }),
  ]);
  return c.json({ ok: true });
});

/** Pedidos de prueba de la landing, los nuevos primero. `status=all` incluye los ya atendidos (los últimos 50). */
admin.get("/trial-requests", async (c) => {
  const all = c.req.query("status") === "all";
  const rows = await getDb(c.env.DB)
    .select({
      id: s.trialRequests.id,
      name: s.trialRequests.name,
      whatsapp: s.trialRequests.whatsapp,
      company: s.trialRequests.company,
      crops: s.trialRequests.crops,
      hectares: s.trialRequests.hectares,
      employees: s.trialRequests.employees,
      department: s.trialRequests.department,
      status: s.trialRequests.status,
      createdAt: s.trialRequests.createdAt,
      contactedAt: s.trialRequests.contactedAt,
    })
    .from(s.trialRequests)
    .where(all ? undefined : eq(s.trialRequests.status, "new"))
    .orderBy(desc(s.trialRequests.createdAt))
    .limit(LIMITS.trialRequests.listLimit);
  return c.json(rows.map((r) => ({ ...r, crops: JSON.parse(r.crops) as string[] })));
});

admin.post("/trial-requests/:id/contacted", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const [r] = await db.select({ id: s.trialRequests.id }).from(s.trialRequests).where(eq(s.trialRequests.id, id)).limit(1);
  if (!r) throw new HTTPException(404, { message: "No existe" });
  await db
    .update(s.trialRequests)
    .set({ status: "contacted", contactedAt: Date.now() })
    .where(eq(s.trialRequests.id, id));
  return c.json({ ok: true });
});
