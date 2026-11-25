/**
 * Datos de contexto de los correos de avisos: lotes alcanzados, pronóstico cacheado, lluvia observada y focos de
 * calor. Se leen en lote por estancia (no una vez por aviso) y solo para los tipos de aviso que los usan.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, type DB } from "../db/client";
import type { AlertContext, PlotInfo } from "../lib/email";
import { haversineKm } from "./benchmark";

const DAY = 86_400_000;
/** Cuántos lotes se leen como máximo por corrida (2 consultas). */
const MAX_PLOTS = 180;
/** Grados alrededor del centro de la estancia donde se buscan focos (unos 40 km). */
const FIRE_BOX = 0.4;
const MAX_HOTSPOTS = 300;

/** Fila pendiente que necesita contexto. */
export interface ContextRow {
  id: string;
  farmId: string;
  kind: string;
  plotIds: string;
  tz: string;
}

const parseIds = (json: string): string[] => {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Distancia en km de un punto al rectángulo del lote (0 si está adentro). */
const distanceToBox = (lon: number, lat: number, b: { minLon: number; maxLon: number; minLat: number; maxLat: number }): number =>
  haversineKm(lon, lat, Math.min(Math.max(lon, b.minLon), b.maxLon), Math.min(Math.max(lat, b.minLat), b.maxLat));

type FarmIds = (kinds: string[]) => string[];

/** Lotes alcanzados por los avisos, con sus datos y su caja. */
async function loadPlots(db: DB, rows: ContextRow[]) {
  const ids = [...new Set(rows.flatMap((r) => parseIds(r.plotIds)))].slice(0, MAX_PLOTS);
  const out = [];
  for (const chunk of chunkForParams(ids, 1)) {
    out.push(
      ...(await db
        .select({
          id: s.plots.id,
          name: s.plots.name,
          crop: s.plots.crop,
          kind: s.plots.kind,
          areaHa: s.plots.areaHa,
          sowingDate: s.plots.sowingDate,
          minLon: s.plots.minLon,
          maxLon: s.plots.maxLon,
          minLat: s.plots.minLat,
          maxLat: s.plots.maxLat,
        })
        .from(s.plots)
        .where(inArray(s.plots.id, chunk))),
    );
  }
  return new Map(out.map((p) => [p.id, p]));
}

/** Pronóstico diario de la última corrida de cada estancia. */
async function loadDays(db: DB, farms: string[], from: string) {
  const out = new Map<string, AlertContext["days"]>();
  for (const chunk of chunkForParams(farms, 1)) {
    const rows = await db
      .select({ farmId: s.forecasts.farmId, date: s.forecasts.validDate, tmin: s.forecasts.tminC, tmax: s.forecasts.tmaxC, rainMm: s.forecasts.precipMm })
      .from(s.forecasts)
      .where(
        and(
          inArray(s.forecasts.farmId, chunk),
          gte(s.forecasts.validDate, from),
          sql`${s.forecasts.runAt} = (SELECT max(f.run_at) FROM forecasts f WHERE f.farm_id = ${s.forecasts.farmId})`,
        ),
      )
      .orderBy(asc(s.forecasts.validDate));
    for (const r of rows) out.set(r.farmId, [...(out.get(r.farmId) ?? []), r]);
  }
  return out;
}

/** Pronóstico horario de las próximas 48 horas. */
async function loadHours(db: DB, farms: string[], now: number) {
  const out = new Map<string, AlertContext["hours"]>();
  for (const chunk of chunkForParams(farms, 1)) {
    const rows = await db
      .select({ farmId: s.forecastHours.farmId, at: s.forecastHours.validAt, tempC: s.forecastHours.tempC, humidityPct: s.forecastHours.humidityPct })
      .from(s.forecastHours)
      .where(and(inArray(s.forecastHours.farmId, chunk), gte(s.forecastHours.validAt, now - 3_600_000), lte(s.forecastHours.validAt, now + 2 * DAY)))
      .orderBy(asc(s.forecastHours.validAt));
    for (const r of rows) out.set(r.farmId, [...(out.get(r.farmId) ?? []), r]);
  }
  return out;
}

/** Lluvia observada (CHIRPS) de los últimos 30 días de la estancia. */
async function loadRain(db: DB, farms: string[], from: string) {
  const out = new Map<string, AlertContext["rainDaily"]>();
  for (const chunk of chunkForParams(farms, 1)) {
    const rows = await db
      .select({ farmId: s.climateDaily.farmId, date: s.climateDaily.date, mm: s.climateDaily.precipMm })
      .from(s.climateDaily)
      .where(and(inArray(s.climateDaily.farmId, chunk), eq(s.climateDaily.plotId, ""), inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]), gte(s.climateDaily.date, from)))
      .orderBy(asc(s.climateDaily.date));
    for (const r of rows) out.set(r.farmId, [...(out.get(r.farmId) ?? []), { date: r.date, mm: r.mm ?? 0 }]);
  }
  return out;
}

/** Focos de calor de los últimos 7 días cerca de cada estancia (una consulta por estancia, pocas por corrida). */
async function loadHotspots(db: DB, farms: string[], now: number) {
  const out = new Map<string, { at: number; lon: number; lat: number }[]>();
  if (!farms.length) return out;
  const centers = await db.select({ id: s.farms.id, lon: s.farms.centroidLon, lat: s.farms.centroidLat }).from(s.farms).where(inArray(s.farms.id, farms.slice(0, 20)));
  for (const c of centers) {
    out.set(
      c.id,
      await db
        .select({ at: s.fireHotspots.acquiredAt, lon: s.fireHotspots.lon, lat: s.fireHotspots.lat })
        .from(s.fireHotspots)
        .where(
          and(
            gte(s.fireHotspots.acquiredAt, now - 7 * DAY),
            gte(s.fireHotspots.lon, c.lon - FIRE_BOX),
            lte(s.fireHotspots.lon, c.lon + FIRE_BOX),
            gte(s.fireHotspots.lat, c.lat - FIRE_BOX),
            lte(s.fireHotspots.lat, c.lat + FIRE_BOX),
          ),
        )
        .limit(MAX_HOTSPOTS),
    );
  }
  return out;
}

/**
 * Contexto de cada notificación de aviso: lotes alcanzados (con distancia al foco más cercano si es fuego),
 * pronóstico, lluvia observada y focos por día. Máximo 6 consultas más una por estancia con fuego.
 * @returns el contexto por id de notificación.
 */
export async function loadAlertContexts(db: DB, rows: ContextRow[], now: number): Promise<Map<string, AlertContext>> {
  const farmsOf: FarmIds = (kinds) => [...new Set(rows.filter((r) => kinds.includes(r.kind)).map((r) => r.farmId))];
  const tz = rows[0]?.tz;
  const [plots, days, hours, rain, hotspots] = await Promise.all([
    loadPlots(db, rows),
    loadDays(db, farmsOf(["excess_rain", "heat_stress"]), localDate(now - DAY, tz)),
    loadHours(db, farmsOf(["frost", "heat_stress"]), now),
    loadRain(db, farmsOf(["drought"]), localDate(now - 30 * DAY, tz)),
    loadHotspots(db, farmsOf(["fire"]), now),
  ]);
  return new Map(
    rows.map((r) => {
      const spots = hotspots.get(r.farmId) ?? [];
      const mine: PlotInfo[] = parseIds(r.plotIds).flatMap((id) => {
        const p = plots.get(id);
        if (!p) return [];
        const dist = spots.length ? Math.min(...spots.map((h) => distanceToBox(h.lon, h.lat, p))) : undefined;
        return [{ id: p.id, name: p.name, crop: p.crop, kind: p.kind, areaHa: p.areaHa, sowingDate: p.sowingDate, distKm: dist }];
      });
      const perDay = new Map<string, number>();
      for (const h of spots) perDay.set(localDate(h.at, r.tz), (perDay.get(localDate(h.at, r.tz)) ?? 0) + 1);
      const ctx: AlertContext = {
        now,
        days: days.get(r.farmId) ?? [],
        hours: hours.get(r.farmId) ?? [],
        plots: mine,
        rainDaily: rain.get(r.farmId) ?? [],
        hotspotsByDay: r.kind === "fire" ? Array.from({ length: 7 }, (_, n) => localDate(now - (6 - n) * DAY, r.tz)).map((date) => ({ date, n: perDay.get(date) ?? 0 })) : undefined,
      };
      return [r.id, ctx];
    }),
  );
}
