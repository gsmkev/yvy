/** Datos del parte semanal además de las cifras básicas: semana anterior, lluvia por día, tareas y lotes que perdieron vigor. */
import { and, asc, between, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { DB } from "../db/client";
import type { WeeklyEmailInput } from "../lib/email";
import type { Farm } from "./farm";

const DAY = 86_400_000;
/** Caída mínima del NDVI medio contra la escena anterior para listar un lote. */
const WORSE_RATIO = 0.95;
const MAX_NDVI_ROWS = 400;

type Extras = Pick<WeeklyEmailInput, "prevRecords" | "rainDaily" | "tasksDone" | "tasksTotal" | "worsened">;

/** Lotes cuyo NDVI medio bajó en la última escena, con la serie de las últimas 8, del que más cayó al que menos. */
async function worsenedPlots(db: DB, farm: Farm, now: number): Promise<NonNullable<Extras["worsened"]>> {
  const rows = await db
    .select({ plotId: s.plotIndexStats.plotId, name: s.plots.name, mean: s.plotIndexStats.mean })
    .from(s.plotIndexStats)
    .innerJoin(s.plots, eq(s.plots.id, s.plotIndexStats.plotId))
    .where(
      and(
        eq(s.plots.farmId, farm.id),
        isNull(s.plots.deletedAt),
        isNull(s.plotIndexStats.deletedAt),
        eq(s.plotIndexStats.idx, "ndvi"),
        eq(s.plotIndexStats.lowConfidence, false),
        gte(s.plotIndexStats.acquiredAt, now - 60 * DAY),
      ),
    )
    .orderBy(asc(s.plotIndexStats.plotId), asc(s.plotIndexStats.acquiredAt))
    .limit(MAX_NDVI_ROWS);
  const byPlot = new Map<string, { name: string; series: number[] }>();
  for (const r of rows) byPlot.set(r.plotId, { name: r.name, series: [...(byPlot.get(r.plotId)?.series ?? []), r.mean] });
  return [...byPlot.values()]
    .filter((p) => p.series.length >= 2)
    .map((p) => ({ name: p.name, from: p.series[p.series.length - 2]!, to: p.series[p.series.length - 1]!, series: p.series.slice(-8) }))
    .filter((p) => p.from > 0 && p.to / p.from <= WORSE_RATIO)
    .sort((a, b) => a.to / a.from - b.to / b.from);
}

/** Lee lo que el parte muestra además de lo básico; son 4 consultas. */
export async function loadWeeklyExtras(db: DB, farm: Farm, now: number): Promise<Extras> {
  const since = now - 7 * DAY;
  const from = localDate(since, farm.tz);
  const to = localDate(now, farm.tz);
  const [prev] = await db
    .select({ n: sql<number>`count(*)` })
    .from(s.records)
    .where(and(eq(s.records.farmId, farm.id), isNull(s.records.deletedAt), gte(s.records.capturedAt, since - 7 * DAY), lt(s.records.capturedAt, since)));
  const rain = await db
    .select({ date: s.climateDaily.date, mm: sql<number>`max(${s.climateDaily.precipMm})` })
    .from(s.climateDaily)
    .where(and(eq(s.climateDaily.farmId, farm.id), eq(s.climateDaily.plotId, ""), inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]), gte(s.climateDaily.date, from)))
    .groupBy(s.climateDaily.date)
    .orderBy(asc(s.climateDaily.date));
  const tasks = await db
    .select({ status: s.tasks.status, n: sql<number>`count(*)` })
    .from(s.tasks)
    .where(and(eq(s.tasks.farmId, farm.id), isNull(s.tasks.deletedAt), ne(s.tasks.status, "cancelled"), between(s.tasks.dueDate, from, to)))
    .groupBy(s.tasks.status);
  return {
    prevRecords: prev?.n ?? 0,
    rainDaily: rain.map((r) => ({ date: r.date, mm: r.mm ?? 0 })),
    tasksDone: tasks.find((x) => x.status === "done")?.n ?? 0,
    tasksTotal: tasks.reduce((a, x) => a + x.n, 0),
    worsened: await worsenedPlots(db, farm, now),
  };
}
