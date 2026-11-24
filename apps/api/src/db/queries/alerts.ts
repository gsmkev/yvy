/** Avisos (RF-70..75) y sus umbrales. */
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { DEFAULT_ALERT_SETTINGS, type AlertSettings } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, NotFoundError, type ScopedDb } from "../scoped";

// ---------- Avisos (RF-70..75) ----------

export async function listAlerts(sdb: ScopedDb, f: { farmId?: string; active?: boolean }) {
  const now = sdb.now();
  return sdb.db
    .select({
      alert: s.alerts,
      useful: sql<
        number | null
      >`(SELECT useful FROM alert_feedback WHERE alert_id = ${s.alerts.id} AND user_id = ${sdb.auth.userId})`,
    })
    .from(s.alerts)
    .where(
      and(
        eq(s.alerts.organizationId, sdb.auth.orgId),
        sdb.workerFilter("alerts"),
        f.farmId ? eq(s.alerts.farmId, f.farmId) : undefined,
        f.active
          ? and(isNull(s.alerts.resolvedAt), or(isNull(s.alerts.validTo), gte(s.alerts.validTo, now)))
          : undefined,
      ),
    )
    .orderBy(desc(s.alerts.validFrom))
    .limit(200);
}

export async function alertFeedback(sdb: ScopedDb, alertId: string, useful: boolean, comment: string | null) {
  const [a] = await sdb.db
    .select({ id: s.alerts.id })
    .from(s.alerts)
    .where(and(eq(s.alerts.id, alertId), eq(s.alerts.organizationId, sdb.auth.orgId), sdb.workerFilter("alerts")))
    .limit(1);
  if (!a) throw new NotFoundError("Aviso inexistente");
  await sdb.db
    .insert(s.alertFeedback)
    .values({ alertId, userId: sdb.auth.userId, useful, comment })
    .onConflictDoUpdate({ target: [s.alertFeedback.alertId, s.alertFeedback.userId], set: { useful, comment } });
}

/** C-04: umbrales de avisos de la estancia (valores por defecto si nunca se configuraron). */
export async function getAlertSettings(
  sdb: ScopedDb,
  farmId: string,
): Promise<AlertSettings & { isDefault: boolean }> {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const [row] = await sdb.db
    .select()
    .from(s.farmAlertSettings)
    .where(and(eq(s.farmAlertSettings.farmId, farmId), eq(s.farmAlertSettings.organizationId, sdb.auth.orgId)))
    .limit(1);
  if (!row) return { ...DEFAULT_ALERT_SETTINGS, isDefault: true };
  return {
    frostTminC: row.frostTminC,
    excessRainMm24h: row.excessRainMm24h,
    droughtDeficitPct: row.droughtDeficitPct,
    isDefault: false,
  };
}

export async function saveAlertSettings(sdb: ScopedDb, farmId: string, v: AlertSettings) {
  sdb.require(can.alertSettings, "Solo el dueño o un administrador cambian los avisos");
  await sdb.requireFarm(farmId);
  const row = { ...v, organizationId: sdb.auth.orgId, updatedAt: sdb.now(), updatedBy: sdb.auth.userId };
  await sdb.db
    .insert(s.farmAlertSettings)
    .values({ farmId, ...row })
    .onConflictDoUpdate({ target: s.farmAlertSettings.farmId, set: row });
}
