/**
 * Aviso de aguada baja (G-30): el último registro `water` de cada punto de interés tipo aguada o tajamar dice
 * "bajo" o "seco". Se recalcula cuando llega un registro de agua (no hace falta esperar al cron) y el aviso se
 * resuelve solo cuando todas las aguadas vuelven a estar medio o llenas.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { addDays, WATER_LOW_LEVELS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch, type DB } from "../db/client";
import { upsertAlert } from "./alerts";
import type { AlertDraft } from "./rules";

/** Ventana de lecturas que se consideran vigentes. */
export const WATER_WINDOW_DAYS = 7;

export interface WaterReading {
  poiId: string;
  name: string;
  level: string;
  capturedAt: number;
}

const fmtLevel = (level: string) => (level === "dry" ? "seca" : "con nivel bajo");

/** Función pura: arma el aviso (o null) a partir de la última lectura de cada aguada. */
export function evaluateWater(readings: WaterReading[], plotIds: string[], today: string): AlertDraft | null {
  const low = readings
    .filter((r) => (WATER_LOW_LEVELS as readonly string[]).includes(r.level))
    // Primero las secas, y dentro de cada nivel la más reciente.
    .sort((a, b) => Number(b.level === "dry") - Number(a.level === "dry") || b.capturedAt - a.capturedAt);
  if (!low.length) return null;
  const top = low[0]!;
  return {
    kind: "water_low",
    severity: low.some((r) => r.level === "dry") ? "warning" : "watch",
    probability: null,
    validFrom: today,
    validTo: addDays(today, 3),
    summary: `Aguada ${top.name} ${fmtLevel(top.level)}${
      low.length > 1 ? ` (y ${low.length - 1} más)` : ""
    }`,
    details: {
      plotIds,
      windowDays: WATER_WINDOW_DAYS,
      pois: low.map((r) => ({ poiId: r.poiId, name: r.name, level: r.level, capturedAt: r.capturedAt })),
    },
  };
}

/** Última lectura de agua de cada aguada o tajamar de la estancia dentro de la ventana (1 query). */
export async function latestWaterReadings(db: DB, farmId: string, now: number): Promise<WaterReading[]> {
  const since = now - WATER_WINDOW_DAYS * 86_400_000;
  const rows = await db
    .select({
      poiId: s.records.poiId,
      name: s.pointsOfInterest.name,
      level: sql<string>`json_extract(${s.records.data}, '$.level')`,
      capturedAt: s.records.capturedAt,
    })
    .from(s.records)
    .innerJoin(s.pointsOfInterest, eq(s.pointsOfInterest.id, s.records.poiId))
    .where(
      and(
        eq(s.records.farmId, farmId),
        eq(s.records.kind, "water"),
        isNull(s.records.deletedAt),
        isNull(s.pointsOfInterest.deletedAt),
        eq(s.pointsOfInterest.kind, "water"),
        sql`${s.records.capturedAt} >= ${since}`,
        sql`${s.records.capturedAt} = (SELECT max(r2.captured_at) FROM records r2 WHERE r2.poi_id = ${s.records.poiId} AND r2.kind = 'water' AND r2.deleted_at IS NULL)`,
      ),
    );
  const byPoi = new Map<string, WaterReading>();
  for (const r of rows) if (r.poiId && !byPoi.has(r.poiId)) byPoi.set(r.poiId, { ...r, poiId: r.poiId });
  return [...byPoi.values()];
}

/** Crea o actualiza el aviso `water_low` de la estancia, o lo resuelve si ya no hay aguadas bajas. */
export async function refreshWaterAlert(
  db: DB,
  farm: { id: string; organizationId: string },
  now: number,
  today: string,
): Promise<void> {
  const readings = await latestWaterReadings(db, farm.id, now);
  const pastures = await db
    .select({ id: s.plots.id })
    .from(s.plots)
    .where(and(eq(s.plots.farmId, farm.id), eq(s.plots.kind, "pasture"), isNull(s.plots.deletedAt)));
  const draft = evaluateWater(
    readings,
    pastures.map((p) => p.id),
    today,
  );
  if (draft) {
    await upsertAlert(db, farm, draft, now);
    return;
  }
  const open = await db
    .select({ id: s.alerts.id })
    .from(s.alerts)
    .where(and(eq(s.alerts.farmId, farm.id), eq(s.alerts.kind, "water_low"), isNull(s.alerts.resolvedAt)));
  if (!open.length) return;
  await runBatch(db, [
    bumpVersion(db),
    db
      .update(s.alerts)
      .set({ resolvedAt: now, updatedAt: now, version: currentVersion })
      .where(and(eq(s.alerts.farmId, farm.id), eq(s.alerts.kind, "water_low"), isNull(s.alerts.resolvedAt))),
  ]);
}
