/**
 * R-07: comparación entre estancias (ahora) y entre campañas. Lecturas agrupadas, sin N+1:
 * 3 consultas SQL para estancias y 3 para campañas. Respeta el alcance por estancia (K-05, T-09).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { addDays, localDate, yieldTHa } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, type ScopedDb } from "./scoped";

export interface FarmCompareRow {
  id: string;
  name: string;
  areaHa: number;
  plots: number;
  records30d: number;
  /** Lluvia de los últimos 30 días (CHIRPS, promedio de fuentes por día). null sin datos. */
  rain30Mm: number | null;
  /** Vigor medio (NDVI) de los lotes en los últimos 30 días. null sin datos. */
  ndvi30: number | null;
  activeAlerts: number;
}

export interface SeasonCompareRow {
  id: string;
  name: string;
  plannedHa: number;
  plots: number;
  /** Hectáreas de los lotes que tienen cosecha registrada y toneladas cosechadas. */
  harvestedHa: number;
  harvestTons: number;
  /** t/ha de los lotes cosechados (null sin cosecha). */
  yieldTHa: number | null;
  /** Objetivo medio (t/ha) de los lotes con objetivo cargado. */
  targetYieldTHa: number | null;
  applications: number;
}

export async function compareFarms(sdb: ScopedDb): Promise<FarmCompareRow[]> {
  sdb.require(can.reports, "Las comparaciones son para quienes ven todo el campo");
  const org = sdb.auth.orgId;
  const now = sdb.now();
  const since = now - 30 * 86_400_000;
  const sinceDate = addDays(localDate(now), -30);
  const scope = sdb.farmScopeSql("farms.id") ?? sql`1`;
  const farmIds = sql`(SELECT id FROM farms WHERE organization_id = ${org} AND deleted_at IS NULL AND ${scope})`;
  const [farms, rain, ndvi] = await Promise.all([
    sdb.db.all<{ id: string; name: string; areaHa: number; plots: number; records30d: number; alerts: number }>(sql`
      SELECT f.id, f.name, f.area_ha AS areaHa,
        (SELECT count(*) FROM plots p WHERE p.farm_id = f.id AND p.deleted_at IS NULL) AS plots,
        (SELECT count(*) FROM records r WHERE r.farm_id = f.id AND r.deleted_at IS NULL AND r.captured_at >= ${since}) AS records30d,
        (SELECT count(*) FROM alerts a WHERE a.farm_id = f.id AND a.resolved_at IS NULL AND (a.valid_to IS NULL OR a.valid_to >= ${now})) AS alerts
      FROM farms f WHERE f.id IN ${farmIds} ORDER BY f.name`),
    sdb.db.all<{ farm_id: string; mm: number }>(sql`
      SELECT farm_id, sum(p) AS mm FROM (
        SELECT farm_id, date, avg(precip_mm) AS p FROM climate_daily
        WHERE plot_id = '' AND date >= ${sinceDate} AND precip_mm IS NOT NULL AND source IN ('chirps', 'chirps_prelim') AND farm_id IN ${farmIds}
        GROUP BY farm_id, date) GROUP BY farm_id`),
    sdb.db.all<{ farm_id: string; v: number }>(sql`
      SELECT p.farm_id, avg(i.mean) AS v FROM plot_index_stats i JOIN plots p ON p.id = i.plot_id
      WHERE i.organization_id = ${org} AND i.deleted_at IS NULL AND i.idx = 'ndvi' AND i.acquired_at >= ${since} AND p.farm_id IN ${farmIds}
      GROUP BY p.farm_id`),
  ]);
  const rainBy = new Map(rain.map((r) => [r.farm_id, Number(r.mm)]));
  const ndviBy = new Map(ndvi.map((r) => [r.farm_id, Number(r.v)]));
  return farms.map((f) => ({
    id: f.id,
    name: f.name,
    areaHa: Number(f.areaHa),
    plots: Number(f.plots),
    records30d: Number(f.records30d),
    rain30Mm: rainBy.has(f.id) ? Math.round(rainBy.get(f.id)!) : null,
    ndvi30: ndviBy.has(f.id) ? Math.round(ndviBy.get(f.id)! * 100) / 100 : null,
    activeAlerts: Number(f.alerts),
  }));
}

export async function compareSeasons(sdb: ScopedDb): Promise<SeasonCompareRow[]> {
  sdb.require(can.reports, "Las comparaciones son para quienes ven todo el campo");
  const org = sdb.auth.orgId;
  const [seasons, plans, harvests, apps] = await Promise.all([
    sdb.db
      .select({ id: s.seasons.id, name: s.seasons.name })
      .from(s.seasons)
      .where(and(eq(s.seasons.organizationId, org), isNull(s.seasons.deletedAt)))
      .orderBy(s.seasons.startDate),
    sdb.db
      .select({
        seasonId: s.plotSeasons.seasonId,
        plotId: s.plotSeasons.plotId,
        target: s.plotSeasons.targetYieldTHa,
        areaHa: s.plots.areaHa,
      })
      .from(s.plotSeasons)
      .innerJoin(s.plots, eq(s.plots.id, s.plotSeasons.plotId))
      .where(
        and(
          eq(s.plotSeasons.organizationId, org),
          isNull(s.plotSeasons.deletedAt),
          isNull(s.plots.deletedAt),
          sdb.workerFilter("plot_seasons"),
        ),
      ),
    sdb.db
      .select({ data: s.records.data, plotId: s.records.plotId, areaHa: s.plots.areaHa })
      .from(s.records)
      .leftJoin(s.plots, eq(s.plots.id, s.records.plotId))
      .where(
        and(
          eq(s.records.organizationId, org),
          eq(s.records.kind, "harvest"),
          isNull(s.records.deletedAt),
          sdb.workerFilter("records"),
        ),
      ),
    sdb.db
      .select({ data: s.records.data })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, org),
          eq(s.records.kind, "application"),
          isNull(s.records.deletedAt),
          sdb.workerFilter("records"),
        ),
      ),
  ]);
  const parse = (j: string) => {
    try {
      return JSON.parse(j) as { seasonId?: string; tons?: number; areaHa?: number };
    } catch {
      return {};
    }
  };
  // cosechas por campaña y lote
  const bySeasonPlot = new Map<string, Map<string, { tons: number; areaHa?: number }[]>>();
  const plotArea = new Map<string, number>();
  for (const h of harvests) {
    const d = parse(h.data);
    if (!d.seasonId || typeof d.tons !== "number" || !h.plotId) continue;
    plotArea.set(h.plotId, Number(h.areaHa ?? 0));
    const m = bySeasonPlot.get(d.seasonId) ?? new Map();
    m.set(h.plotId, [...(m.get(h.plotId) ?? []), { tons: d.tons, areaHa: d.areaHa }]);
    bySeasonPlot.set(d.seasonId, m);
  }
  const appsBy = new Map<string, number>();
  for (const a of apps) {
    const id = parse(a.data).seasonId;
    if (id) appsBy.set(id, (appsBy.get(id) ?? 0) + 1);
  }
  return seasons.map((se) => {
    const mine = plans.filter((p) => p.seasonId === se.id);
    const targets = mine.filter((p) => p.target != null);
    let tons = 0;
    let ha = 0;
    for (const [plotId, hs] of bySeasonPlot.get(se.id) ?? []) {
      const y = yieldTHa(hs, plotArea.get(plotId) ?? 0);
      if (y === null) continue;
      const t = hs.reduce((a, h) => a + h.tons, 0);
      tons += t;
      ha += t / y;
    }
    return {
      id: se.id,
      name: se.name,
      plannedHa: Math.round(mine.reduce((a, p) => a + Number(p.areaHa), 0) * 10) / 10,
      plots: mine.length,
      harvestedHa: Math.round(ha * 10) / 10,
      harvestTons: Math.round(tons * 100) / 100,
      yieldTHa: ha > 0 ? Math.round((tons / ha) * 100) / 100 : null,
      targetYieldTHa: targets.length
        ? Math.round((targets.reduce((a, p) => a + (p.target ?? 0), 0) / targets.length) * 100) / 100
        : null,
      applications: appsBy.get(se.id) ?? 0,
    };
  });
}
