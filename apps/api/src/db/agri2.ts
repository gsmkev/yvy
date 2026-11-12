/**
 * Agricultura, segunda tanda (agri-p2): fenología por grados-día, ventana de siembra, carencias,
 * zonas de amortiguación, suelo, entregas, balance hídrico, etc. Solo lectura sobre datos que ya existen o
 * tablas propias de la web. Toda consulta pasa por ScopedDb.
 */
import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import {
  accumulateGdd,
  addDays,
  CROP_GDD,
  comparePheno,
  estimateStage,
  LIMITS,
  localDate,
  nextStage,
  sowingWindow,
  type CROPS,
  type PHENO_STAGES,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { NotFoundError, type ScopedDb } from "./scoped";

const DAY = 86_400_000;

/** Lote vivo de la organización (y visible para el empleado); 404 si no. */
export async function requirePlotRow(sdb: ScopedDb, plotId: string) {
  const [plot] = await sdb.db
    .select({
      id: s.plots.id,
      farmId: s.plots.farmId,
      name: s.plots.name,
      kind: s.plots.kind,
      crop: s.plots.crop,
      areaHa: s.plots.areaHa,
      sowingDate: s.plots.sowingDate,
      minLon: s.plots.minLon,
      maxLon: s.plots.maxLon,
      minLat: s.plots.minLat,
      maxLat: s.plots.maxLat,
    })
    .from(s.plots)
    .where(
      and(
        eq(s.plots.id, plotId),
        eq(s.plots.organizationId, sdb.auth.orgId),
        isNull(s.plots.deletedAt),
        sdb.workerFilter("plots"),
      ),
    )
    .limit(1);
  if (!plot) throw new NotFoundError("Lote inexistente");
  return plot;
}

export type PlotRow = Awaited<ReturnType<typeof requirePlotRow>>;

/** Fecha de siembra del lote: el último registro `sowing` de los últimos 400 días y, si no hay, la fecha del lote. */
export async function plotSowing(
  sdb: ScopedDb,
  plot: PlotRow,
  tz = "America/Asuncion",
): Promise<{ date: string; source: "record" | "plot"; crop: string | null } | null> {
  const since = sdb.now() - 400 * DAY;
  const [rec] = await sdb.db
    .select({ at: s.records.capturedAt, crop: sql<string | null>`json_extract(${s.records.data}, '$.crop')` })
    .from(s.records)
    .where(
      and(
        eq(s.records.organizationId, sdb.auth.orgId),
        eq(s.records.plotId, plot.id),
        eq(s.records.kind, "sowing"),
        isNull(s.records.deletedAt),
        gte(s.records.capturedAt, since),
      ),
    )
    .orderBy(desc(s.records.capturedAt))
    .limit(1);
  if (rec) return { date: localDate(rec.at, tz), source: "record", crop: rec.crop };
  if (plot.sowingDate) return { date: plot.sowingDate, source: "plot", crop: null };
  return null;
}

type Stage = (typeof PHENO_STAGES)[number];
type Crop = (typeof CROPS)[number];

export interface Phenology {
  status: "ok" | "no_crop" | "no_reference" | "no_sowing_date" | "no_data";
  crop: string | null;
  sowingDate: string | null;
  sowingSource: "record" | "plot" | null;
  baseC: number | null;
  gdd: number | null;
  /** Días con temperatura sobre los días transcurridos desde la siembra: si es bajo, el GDD queda corto. */
  coverage: { days: number; of: number } | null;
  estimatedStage: Stage | null;
  next: { stage: Stage; gddLeft: number } | null;
  observed: { stage: Stage; condition: string; at: number } | null;
  comparison: "ahead" | "on_track" | "behind" | null;
}

/** A-04: GDD desde la siembra (NASA POWER) contra el último `crop_status` del lote. 3 consultas. */
export async function plotPhenology(sdb: ScopedDb, plotId: string): Promise<Phenology> {
  const plot = await requirePlotRow(sdb, plotId);
  const base: Phenology = {
    status: "ok",
    crop: plot.crop,
    sowingDate: null,
    sowingSource: null,
    baseC: null,
    gdd: null,
    coverage: null,
    estimatedStage: null,
    next: null,
    observed: null,
    comparison: null,
  };
  const sowing = await plotSowing(sdb, plot);
  const crop = ((sowing?.crop as Crop | null) ?? plot.crop) as Crop | null;
  if (plot.kind !== "crop" || !crop) return { ...base, status: "no_crop" };
  const cfg = CROP_GDD[crop];
  if (!cfg) return { ...base, crop, status: "no_reference" };
  if (!sowing) return { ...base, crop, status: "no_sowing_date", baseC: cfg.baseC };
  const [temps, [obs]] = await Promise.all([
    sdb.db
      .select({ date: s.climateDaily.date, tminC: s.climateDaily.tminC, tmaxC: s.climateDaily.tmaxC })
      .from(s.climateDaily)
      .where(
        and(
          eq(s.climateDaily.farmId, plot.farmId),
          eq(s.climateDaily.plotId, ""),
          eq(s.climateDaily.source, "nasa_power"),
          gte(s.climateDaily.date, sowing.date),
        ),
      )
      .orderBy(asc(s.climateDaily.date))
      .limit(500),
    sdb.db
      .select({
        at: s.records.capturedAt,
        stage: sql<Stage>`json_extract(${s.records.data}, '$.stage')`,
        condition: sql<string>`json_extract(${s.records.data}, '$.condition')`,
      })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, sdb.auth.orgId),
          eq(s.records.plotId, plotId),
          eq(s.records.kind, "crop_status"),
          isNull(s.records.deletedAt),
          gte(s.records.capturedAt, Date.parse(`${sowing.date}T00:00:00Z`)),
        ),
      )
      .orderBy(desc(s.records.capturedAt))
      .limit(1),
  ]);
  const acc = accumulateGdd(temps, crop, sowing.date);
  const elapsed = Math.max(1, Math.round((sdb.now() - Date.parse(`${sowing.date}T00:00:00Z`)) / DAY));
  const common = { ...base, crop, sowingDate: sowing.date, sowingSource: sowing.source, baseC: cfg.baseC };
  if (!acc || acc.days === 0) return { ...common, status: "no_data", coverage: { days: 0, of: elapsed } };
  const estimatedStage = estimateStage(crop, acc.gdd);
  const observed = obs?.stage ? { stage: obs.stage, condition: obs.condition, at: obs.at } : null;
  return {
    ...common,
    gdd: acc.gdd,
    coverage: { days: acc.days, of: elapsed },
    estimatedStage,
    next: nextStage(crop, acc.gdd),
    observed,
    comparison: estimatedStage && observed ? comparePheno(estimatedStage, observed.stage) : null,
  };
}

/** Estancia visible para el usuario (el empleado solo si tiene lotes en ella); 404 si no. */
export async function requireFarmRow(sdb: ScopedDb, farmId: string) {
  const [farm] = await sdb.db
    .select({
      id: s.farms.id,
      name: s.farms.name,
      tz: s.farms.timezone,
      areaHa: s.farms.areaHa,
      lon: s.farms.centroidLon,
      lat: s.farms.centroidLat,
    })
    .from(s.farms)
    .where(
      and(
        eq(s.farms.id, farmId),
        eq(s.farms.organizationId, sdb.auth.orgId),
        isNull(s.farms.deletedAt),
        sdb.workerFilter("farms"),
      ),
    )
    .limit(1);
  if (!farm) throw new NotFoundError("Estancia inexistente");
  return farm;
}

/** Última corrida del pronóstico diario de la estancia desde hoy (hasta `days` días). */
export async function latestForecastDays(sdb: ScopedDb, farmId: string, today: string, days: number) {
  const [latest] = await sdb.db
    .select({ runAt: sql<number | null>`max(${s.forecasts.runAt})` })
    .from(s.forecasts)
    .where(eq(s.forecasts.farmId, farmId));
  if (!latest?.runAt) return { runAt: null as number | null, days: [] };
  const rows = await sdb.db
    .select({
      date: s.forecasts.validDate,
      tminC: s.forecasts.tminC,
      tmaxC: s.forecasts.tmaxC,
      precipMm: s.forecasts.precipMm,
    })
    .from(s.forecasts)
    .where(
      and(eq(s.forecasts.farmId, farmId), eq(s.forecasts.runAt, latest.runAt), gte(s.forecasts.validDate, today)),
    )
    .orderBy(asc(s.forecasts.validDate))
    .limit(days);
  return { runAt: latest.runAt, days: rows };
}

/** A-05: ventana de siembra de los próximos días (humedad del suelo NASA POWER + pronóstico MET Norway). 3 consultas. */
export async function farmSowingWindow(sdb: ScopedDb, farmId: string, crop: Crop) {
  const farm = await requireFarmRow(sdb, farmId);
  const today = localDate(sdb.now(), farm.tz);
  const [soilRows, forecast] = await Promise.all([
    sdb.db
      .select({ date: s.climateDaily.date, v: s.climateDaily.soilMoisture0_7 })
      .from(s.climateDaily)
      .where(
        and(
          eq(s.climateDaily.farmId, farmId),
          eq(s.climateDaily.plotId, ""),
          eq(s.climateDaily.source, "nasa_power"),
          isNotNull(s.climateDaily.soilMoisture0_7),
          gte(s.climateDaily.date, addDays(today, -10)),
        ),
      )
      .orderBy(desc(s.climateDaily.date))
      .limit(1),
    latestForecastDays(sdb, farmId, today, LIMITS.sowing.horizonDays),
  ]);
  const soil = soilRows[0] ?? null;
  const result = sowingWindow(crop, soil?.v ?? null, forecast.days);
  return { crop, ...result, soilDate: soil?.date ?? null, forecastRunAt: forecast.runAt };
}
