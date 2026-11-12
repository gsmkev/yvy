/**
 * Guardado de avisos con deduplicación (RF-72) y creación de notificaciones (RF-73).
 * dedupe_key = estancia + tipo + fecha de inicio de la ventana; además, un aviso activo del mismo tipo que se
 * solapa en el tiempo se actualiza en vez de crear otro (B8). Si el aviso ya existe y la severidad no
 * subió, no se vuelve a notificar.
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { newId, parseNotificationPrefs, wantsNotification } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, chunkForParams, currentVersion, runBatch, type DB, type Stmt } from "../db/client";
import { withPlanCrops } from "../db/plan-crops";
import { alertOutboxStmts } from "../db/webhooks";
import type { HourlyForecast } from "./weather";
import { affectedPlots, severityRank, type AlertDraft } from "./rules";

const SOURCES: Record<AlertDraft["kind"], string> = {
  frost: "MET Norway",
  excess_rain: "MET Norway",
  drought: "CHIRPS + NASA POWER + MET Norway",
  fire: "NASA FIRMS",
  pest_threshold: "Monitoreos de plagas (umbral por defecto)",
  water_low: "Registros de aguadas",
  heat_stress: "MET Norway",
  rust_risk: "MET Norway (humedad y temperatura horarias)",
};

export async function upsertAlert(
  db: DB,
  farm: { id: string; organizationId: string },
  draft: AlertDraft,
  now = Date.now(),
): Promise<{ id: string; notified: boolean } | null> {
  const plots = await withPlanCrops(
    db,
    await db
      .select({ id: s.plots.id, kind: s.plots.kind, crop: s.plots.crop })
      .from(s.plots)
      .where(and(eq(s.plots.farmId, farm.id), isNull(s.plots.deletedAt))),
  );
  const plotIds = (draft.details.plotIds as string[] | undefined) ?? affectedPlots(draft.kind, plots);
  const dedupeKey = `${farm.id}:${draft.kind}:${draft.validFrom}`;
  const validFrom = Date.parse(`${draft.validFrom}T00:00:00-03:00`);
  const validTo = Date.parse(`${draft.validTo}T23:59:59-03:00`);
  let [existing] = await db.select().from(s.alerts).where(eq(s.alerts.dedupeKey, dedupeKey)).limit(1);
  // B8: un aviso que se corre día a día se actualiza en vez de duplicarse si la ventana se solapa.
  if (!existing)
    [existing] = await db
      .select()
      .from(s.alerts)
      .where(
        and(
          eq(s.alerts.farmId, farm.id),
          eq(s.alerts.kind, draft.kind),
          isNull(s.alerts.resolvedAt),
          lte(s.alerts.validFrom, validTo),
          gte(s.alerts.validTo, validFrom),
        ),
      )
      .orderBy(desc(s.alerts.validFrom))
      .limit(1);

  if (
    existing &&
    existing.severity === draft.severity &&
    existing.probability === draft.probability &&
    existing.summary === draft.summary &&
    existing.validTo === validTo
  ) {
    return { id: existing.id, notified: false };
  }
  const id = existing?.id ?? newId();
  const stmts: Stmt[] = [bumpVersion(db)];
  const row = {
    severity: draft.severity,
    probability: draft.probability,
    validFrom,
    validTo,
    plotIds: JSON.stringify(plotIds),
    summary: draft.summary,
    details: JSON.stringify(draft.details),
    resolvedAt: null,
    updatedAt: now,
    version: currentVersion,
  };
  if (existing) stmts.push(db.update(s.alerts).set(row).where(eq(s.alerts.id, id)));
  else
    stmts.push(
      db.insert(s.alerts).values({
        id,
        organizationId: farm.organizationId,
        farmId: farm.id,
        kind: draft.kind,
        source: SOURCES[draft.kind],
        dedupeKey,
        createdAt: now,
        ...row,
      }),
    );
  stmts.push(db.delete(s.alertPlots).where(eq(s.alertPlots.alertId, id)));
  for (let i = 0; i < plotIds.length; i += 40) {
    stmts.push(db.insert(s.alertPlots).values(plotIds.slice(i, i + 40).map((plotId) => ({ alertId: id, plotId }))));
  }

  // I-02: aviso nuevo (no una actualización) → buzón de webhooks, en el mismo batch
  if (!existing)
    stmts.push(
      ...(await alertOutboxStmts(db, farm.organizationId, {
        id,
        farmId: farm.id,
        kind: draft.kind,
        severity: draft.severity,
        probability: draft.probability,
        summary: draft.summary,
        validFrom,
        validTo,
        plotIds,
        source: SOURCES[draft.kind],
      }, now)),
    );
  const notify = !existing || severityRank(draft.severity) > severityRank(existing.severity);
  if (notify) stmts.push(...(await notificationStmts(db, farm.organizationId, id, draft.kind, plotIds, now)));
  await runBatch(db, stmts);
  return { id, notified: notify };
}

/** Dueño, admin y agrónomo: push + email. Empleado: solo helada y fuego de sus lotes, por push. */
async function notificationStmts(
  db: DB,
  orgId: string,
  alertId: string,
  kind: AlertDraft["kind"],
  plotIds: string[],
  now: number,
): Promise<Stmt[]> {
  const members = await db
    .select({ userId: s.memberships.userId, role: s.memberships.role })
    .from(s.memberships)
    .where(
      and(eq(s.memberships.organizationId, orgId), isNull(s.memberships.deletedAt), eq(s.memberships.status, "active")),
    );
  const workers =
    (kind === "frost" || kind === "fire") && plotIds.length
      ? await db
          .selectDistinct({ userId: s.plotAssignments.userId })
          .from(s.plotAssignments)
          .where(and(inArray(s.plotAssignments.plotId, plotIds.slice(0, 90)), isNull(s.plotAssignments.deletedAt)))
      : [];
  const workerSet = new Set(workers.map((w) => w.userId));
  // U-29: lo que el usuario apagó para este tipo de aviso no se crea
  const prefs = new Map<string, ReturnType<typeof parseNotificationPrefs>>();
  for (const chunk of chunkForParams(members, 1)) {
    const found = await db
      .select({ userId: s.notificationPrefs.userId, prefs: s.notificationPrefs.prefs })
      .from(s.notificationPrefs)
      .where(inArray(s.notificationPrefs.userId, chunk.map((m) => m.userId)));
    for (const f of found) prefs.set(f.userId, parseNotificationPrefs(f.prefs));
  }
  const wants = (userId: string, channel: "push" | "email") =>
    wantsNotification(prefs.get(userId) ?? parseNotificationPrefs(null), kind, channel);
  const rows: (typeof s.notifications.$inferInsert)[] = [];
  for (const m of members) {
    // Supervisor y contratista reciben solo lo de sus lotes asignados, como el empleado (el alcance por estancia no se evalúa acá).
    if (m.role === "worker" || m.role === "contractor" || m.role === "supervisor") {
      if (workerSet.has(m.userId) && wants(m.userId, "push"))
        rows.push({ id: newId(), userId: m.userId, alertId, channel: "push", createdAt: now });
    } else {
      if (wants(m.userId, "push")) rows.push({ id: newId(), userId: m.userId, alertId, channel: "push", createdAt: now });
      if (wants(m.userId, "email")) rows.push({ id: newId(), userId: m.userId, alertId, channel: "email", createdAt: now });
    }
  }
  const out: Stmt[] = [];
  for (let i = 0; i < rows.length; i += 12) out.push(db.insert(s.notifications).values(rows.slice(i, i + 12)));
  return out;
}

/** Guarda la corrida y deja solo las últimas N por estancia. */
/** Reemplaza el pronóstico horario de la estancia (solo la última corrida): borra todo y guarda las horas nuevas. */
export function saveHourlyStmts(db: DB, farmId: string, hours: HourlyForecast[]): Stmt[] {
  const out: Stmt[] = [db.delete(s.forecastHours).where(eq(s.forecastHours.farmId, farmId))];
  const rows = hours.map((h) => ({ farmId, ...h }));
  // 6 columnas por fila y ≤ 100 parámetros por consulta
  for (const chunk of chunkForParams(rows, 6)) out.push(db.insert(s.forecastHours).values(chunk));
  return out;
}

export function saveForecastStmts(
  db: DB,
  farmId: string,
  runAt: number,
  days: {
    date: string;
    tminC: number | null;
    tmaxC: number | null;
    precipMm: number;
    windKmh: number | null;
    windDirDeg: number | null;
  }[],
  keep: number,
): Stmt[] {
  const rows = days.map((d) => ({
    farmId,
    runAt,
    source: "met_norway",
    validDate: d.date,
    tminC: d.tminC,
    tmaxC: d.tmaxC,
    precipMm: d.precipMm,
    windKmh: d.windKmh,
    windDirDeg: d.windDirDeg,
  }));
  const out: Stmt[] = [];
  for (let i = 0; i < rows.length; i += 10)
    out.push(
      db
        .insert(s.forecasts)
        .values(rows.slice(i, i + 10))
        .onConflictDoNothing(),
    );
  out.push(
    db
      .delete(s.forecasts)
      .where(
        and(
          eq(s.forecasts.farmId, farmId),
          sql`${s.forecasts.runAt} NOT IN (SELECT DISTINCT run_at FROM forecasts WHERE farm_id = ${farmId} ORDER BY run_at DESC LIMIT ${keep})`,
        ),
      ),
  );
  return out;
}
