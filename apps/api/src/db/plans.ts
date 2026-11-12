/**
 * Plan de la organización visto por el dueño (P-10): topes, uso y pedido de cambio. No hay cobro (P-11): pedir un plan
 * o más topes deja un pedido pendiente que el panel interno aprueba o rechaza (routes/admin.ts).
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { LIMITS, newId, planLimits, type REQUESTABLE_PLANS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { auditStmts } from "./audit";
import { runBatch } from "./client";
import { can, type ScopedDb } from "./scoped";

export interface PlanRequestInput {
  plan: (typeof REQUESTABLE_PLANS)[number];
  maxHa?: number | null;
  maxUsers?: number | null;
  note?: string | null;
}

/** Plan actual, topes efectivos, uso (hectáreas de estancias y personas activas) y el pedido pendiente o el último resuelto. */
export async function planOverview(sdb: ScopedDb) {
  sdb.require(can.manageOrg, "Solo el dueño ve el plan de la organización");
  const org = sdb.auth.orgId;
  const [[o], [ha], [users], requests] = await Promise.all([
    sdb.db
      .select({
        plan: s.organizations.plan,
        trialEndsAt: s.organizations.trialEndsAt,
        maxHa: s.organizations.maxHa,
        maxUsers: s.organizations.maxUsers,
      })
      .from(s.organizations)
      .where(eq(s.organizations.id, org))
      .limit(1),
    sdb.db
      .select({ ha: sql<number>`coalesce(sum(area_ha), 0)` })
      .from(s.farms)
      .where(and(eq(s.farms.organizationId, org), isNull(s.farms.deletedAt))),
    sdb.db
      .select({ n: sql<number>`count(*)` })
      .from(s.memberships)
      .where(
        and(eq(s.memberships.organizationId, org), isNull(s.memberships.deletedAt), eq(s.memberships.status, "active")),
      ),
    sdb.db
      .select()
      .from(s.planRequests)
      .where(eq(s.planRequests.organizationId, org))
      .orderBy(desc(s.planRequests.createdAt))
      .limit(5),
  ]);
  const plan = o?.plan ?? "trial";
  return {
    plan,
    trialEndsAt: o?.trialEndsAt ?? null,
    limits: planLimits(plan, o ?? {}),
    usage: { ha: Math.round(Number(ha?.ha ?? 0)), users: Number(users?.n ?? 0) },
    /** Topes del plan que se puede pedir, para mostrarlos al elegir. */
    plans: { active: LIMITS.plans.active },
    pending: requests.find((r) => r.status === "pending") ?? null,
    lastResolved: requests.find((r) => r.status === "approved" || r.status === "rejected") ?? null,
  };
}

/**
 * Deja un pedido pendiente. Tiene que pedir algo distinto de lo que ya tiene: otro plan, o topes por encima de los
 * efectivos. Un solo pedido pendiente por organización (índice único parcial); para cambiarlo, se cancela el anterior.
 */
export async function createPlanRequest(sdb: ScopedDb, input: PlanRequestInput) {
  sdb.require(can.manageOrg, "Solo el dueño pide un cambio de plan");
  const cur = await planOverview(sdb);
  if (cur.pending) throw new HTTPException(409, { message: "Ya tenés un pedido pendiente: cancelalo para hacer otro" });
  const wantsPlan = input.plan !== cur.plan;
  const wantsHa = input.maxHa != null && (cur.limits.maxHa === null || input.maxHa > cur.limits.maxHa);
  const wantsUsers = input.maxUsers != null && (cur.limits.maxUsers === null || input.maxUsers > cur.limits.maxUsers);
  if (!wantsPlan && !wantsHa && !wantsUsers)
    throw new HTTPException(400, { message: "Ese plan y esos topes ya son los de tu organización" });
  const id = newId();
  const now = sdb.now();
  await runBatch(sdb.db, [
    sdb.db.insert(s.planRequests).values({
      id,
      organizationId: sdb.auth.orgId,
      requestedBy: sdb.auth.userId,
      plan: input.plan,
      maxHa: input.maxHa ?? null,
      maxUsers: input.maxUsers ?? null,
      note: input.note?.trim() || null,
      createdAt: now,
    }),
    ...auditStmts(
      sdb.db,
      { userId: sdb.auth.userId, orgId: sdb.auth.orgId },
      [
        {
          action: "plan_request",
          entity: "plan",
          entityId: id,
          detail: { plan: input.plan, maxHa: input.maxHa ?? null, maxUsers: input.maxUsers ?? null },
        },
      ],
      now,
    ),
  ]);
  const [o] = await sdb.db
    .select({ name: s.organizations.name })
    .from(s.organizations)
    .where(eq(s.organizations.id, sdb.auth.orgId))
    .limit(1);
  return { id, orgName: o?.name ?? "" };
}

/** El dueño retira su pedido pendiente. */
export async function cancelPlanRequest(sdb: ScopedDb) {
  sdb.require(can.manageOrg, "Solo el dueño cancela un pedido de plan");
  const now = sdb.now();
  await runBatch(sdb.db, [
    sdb.db
      .update(s.planRequests)
      .set({ status: "cancelled", resolvedAt: now, resolvedBy: sdb.auth.userId })
      .where(and(eq(s.planRequests.organizationId, sdb.auth.orgId), eq(s.planRequests.status, "pending"))),
    ...auditStmts(
      sdb.db,
      { userId: sdb.auth.userId, orgId: sdb.auth.orgId },
      [{ action: "plan_request_cancel", entity: "plan", entityId: null }],
      now,
    ),
  ]);
}
