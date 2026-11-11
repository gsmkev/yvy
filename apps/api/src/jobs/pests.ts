/**
 * Aviso por umbral de plagas (A-41): promedio de las observaciones con número por metro de los últimos 7 días,
 * por lote y plaga, contra PEST_THRESHOLDS (valores por defecto, a revisar por un agrónomo).
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { addDays, PEST_THRESHOLDS, PEST_WINDOW_DAYS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, type DB } from "../db/client";
import type { AlertDraft } from "./rules";

export interface PestAverage {
  plotId: string;
  pest: string;
  avgPerMeter: number;
  n: number;
}

export interface PestPlot {
  id: string;
  name: string;
  crop: string | null;
}

const fmt = (n: number) => n.toFixed(1).replace(".", ",");

/** Función pura: arma el aviso (o null) a partir de los promedios por lote y plaga. */
export function evaluatePests(
  averages: PestAverage[],
  plots: PestPlot[],
  /** Último estado fenológico conocido por lote; si falta, no se descarta el lote. */
  stageByPlot: Map<string, string>,
  today: string,
): AlertDraft | null {
  const byId = new Map(plots.map((p) => [p.id, p]));
  const hits: { plot: PestPlot; pest: string; avg: number; threshold: number }[] = [];
  for (const a of averages) {
    const rule = PEST_THRESHOLDS[a.pest];
    const plot = byId.get(a.plotId);
    if (!rule || !plot || a.avgPerMeter <= rule.perMeter) continue;
    if (!plot.crop || !rule.crops.includes(plot.crop)) continue;
    const stage = stageByPlot.get(plot.id);
    if (rule.stages && stage && !rule.stages.includes(stage)) continue;
    hits.push({ plot, pest: a.pest, avg: a.avgPerMeter, threshold: rule.perMeter });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.avg / b.threshold - a.avg / a.threshold);
  const top = hits[0]!;
  const plotIds = [...new Set(hits.map((h) => h.plot.id))];
  const names = [...new Set(hits.map((h) => h.plot.name))];
  return {
    kind: "pest_threshold",
    severity: hits.some((h) => h.avg >= h.threshold * 2) ? "warning" : "watch",
    probability: null,
    validFrom: today,
    validTo: addDays(today, 3),
    summary: `${PEST_THRESHOLDS[top.pest]!.label}: promedio de ${fmt(top.avg)} por metro en ${top.plot.name}, sobre el umbral de ${fmt(top.threshold)}${
      names.length > 1 ? ` (y ${names.length - 1} lote${names.length > 2 ? "s" : ""} más)` : ""
    }`,
    details: {
      plotIds,
      windowDays: PEST_WINDOW_DAYS,
      hits: hits.map((h) => ({ plotId: h.plot.id, pest: h.pest, avg: Number(h.avg.toFixed(2)), threshold: h.threshold })),
      defaultThresholds: true,
    },
  };
}

/** Lee los promedios de la ventana (en SQL, sin parsear filas en el Worker) y evalúa. */
export async function pestAlertDraft(db: DB, farmId: string, now: number, today: string): Promise<AlertDraft | null> {
  const since = now - PEST_WINDOW_DAYS * 86_400_000;
  const perMeter = sql`json_extract(${s.records.data}, '$.perMeter')`;
  const rows = await db
    .select({
      plotId: s.records.plotId,
      pest: sql<string>`json_extract(${s.records.data}, '$.pest')`,
      avg: sql<number>`avg(${perMeter})`,
      n: sql<number>`count(*)`,
    })
    .from(s.records)
    .where(
      and(
        eq(s.records.farmId, farmId),
        eq(s.records.kind, "pest"),
        isNull(s.records.deletedAt),
        gte(s.records.capturedAt, since),
        sql`${s.records.plotId} IS NOT NULL`,
        sql`${perMeter} IS NOT NULL`,
      ),
    )
    .groupBy(s.records.plotId, sql`json_extract(${s.records.data}, '$.pest')`);
  const averages: PestAverage[] = rows
    .filter((r) => r.plotId && r.avg !== null)
    .map((r) => ({ plotId: r.plotId!, pest: r.pest, avgPerMeter: r.avg, n: r.n }))
    .filter((r) => (PEST_THRESHOLDS[r.pest]?.perMeter ?? Infinity) < r.avgPerMeter);
  if (!averages.length) return null;

  const plotIds = [...new Set(averages.map((a) => a.plotId))];
  const plots: PestPlot[] = [];
  const stageByPlot = new Map<string, string>();
  for (const ids of chunkForParams(plotIds, 1)) {
    plots.push(
      ...(await db
        .select({ id: s.plots.id, name: s.plots.name, crop: s.plots.crop })
        .from(s.plots)
        .where(and(inArray(s.plots.id, ids), isNull(s.plots.deletedAt)))),
    );
    const stages = await db
      .select({ plotId: s.records.plotId, stage: sql<string>`json_extract(${s.records.data}, '$.stage')` })
      .from(s.records)
      .where(
        and(
          inArray(s.records.plotId, ids),
          eq(s.records.kind, "crop_status"),
          isNull(s.records.deletedAt),
          gte(s.records.capturedAt, now - 45 * 86_400_000),
        ),
      )
      .orderBy(desc(s.records.capturedAt));
    for (const r of stages) if (r.plotId && !stageByPlot.has(r.plotId)) stageByPlot.set(r.plotId, r.stage);
  }
  return evaluatePests(averages, plots, stageByPlot, today);
}
