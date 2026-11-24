/** Topes del plan. */
import { and, eq, isNull, sql } from "drizzle-orm";
import { planLimits as limitsFor, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { ScopedDb } from "./index";
import { PlanLimitError } from "./permissions";

const fmt = (n: number) => n.toLocaleString("es-PY");

/** Topes efectivos de la organización. */
export async function planLimits(sdb: ScopedDb) {
  const [o] = await sdb.db
    .select({ plan: s.organizations.plan, maxHa: s.organizations.maxHa, maxUsers: s.organizations.maxUsers })
    .from(s.organizations)
    .where(eq(s.organizations.id, sdb.auth.orgId))
    .limit(1);
  return limitsFor(o?.plan ?? "trial", o ?? {});
}

/** Falla con 402 y un mensaje claro si sumar `extraHa` hectáreas de estancias pasa el tope del plan. */
export async function requireHaRoom(sdb: ScopedDb, extraHa: number, what: "farms" | "plots" = "farms"): Promise<void> {
  const { maxHa } = await sdb.planLimits();
  if (maxHa === null) return;
  const [r] = await sdb.db
    .select({ ha: sql<number>`coalesce(sum(area_ha), 0)` })
    .from(what === "farms" ? s.farms : s.plots)
    .where(
      and(
        eq(what === "farms" ? s.farms.organizationId : s.plots.organizationId, sdb.auth.orgId),
        isNull(what === "farms" ? s.farms.deletedAt : s.plots.deletedAt),
      ),
    );
  const total = Number(r?.ha ?? 0) + extraHa;
  if (total > maxHa)
    throw new PlanLimitError(
      t("ui.plan.limitHa", { max: fmt(maxHa), total: fmt(Math.round(total)), extra: fmt(Math.round(extraHa)) }),
    );
}

/** Falla con 402 si sumar una persona pasa el tope de usuarios (la que ya tiene acceso no cuenta de nuevo). */
export async function requireUserRoom(sdb: ScopedDb, existingUserId: string | null): Promise<void> {
  const { maxUsers } = await sdb.planLimits();
  if (maxUsers === null) return;
  const rows = await sdb.db
    .select({ userId: s.memberships.userId })
    .from(s.memberships)
    .where(
      and(
        eq(s.memberships.organizationId, sdb.auth.orgId),
        isNull(s.memberships.deletedAt),
        eq(s.memberships.status, "active"),
      ),
    );
  if (existingUserId && rows.some((m) => m.userId === existingUserId)) return;
  if (rows.length + 1 > maxUsers) throw new PlanLimitError(t("ui.plan.limitUsers", { max: maxUsers }));
}
