/**
 * Datos y cálculos de la ficha del lote y de las pantallas de Lotes, Campañas, Productos y Buscador (ola 2).
 * Todo sale de la base local (anda sin señal); lo puro está aparte de las consultas para poder probarlo.
 */
import { NDVI_RAMP } from "@yvy/shared";
import type { LocalDb } from "../db/store";
import { fmtNumber } from "../office/format";
import { areaLabel, cToTemp, haToArea, mmToRain, rainLabel, tempLabel, type Units } from "@yvy/shared";

// ---------- Unidades elegidas (superficie, lluvia, temperatura) ----------

/** "1.250 ha" o "1.667 cuadras" según la preferencia. */
export const fmtArea = (ha: number, u: Units): string => `${fmtNumber(haToArea(ha, u.area), 1)} ${areaLabel(u.area)}`;
/** "12 mm" o "0,47 pulg". */
export const fmtRain = (mm: number, u: Units): string => `${fmtNumber(mmToRain(mm, u.rain), u.rain === "in" ? 2 : 0)} ${rainLabel(u.rain)}`;
/** "31 °C" o "88 °F". */
export const fmtTemp = (c: number, u: Units): string => `${fmtNumber(cToTemp(c, u.temp), 0)} ${tempLabel(u.temp)}`;

// ---------- Coordenadas ----------

const hemi = (v: number, pos: string, neg: string) => (v >= 0 ? pos : neg);

/** Decimal con 5 decimales (~1 m): "-25.28123, -57.63456". */
export const decimalCoords = (lon: number, lat: number): string => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

const dm = (v: number): string => {
  const a = Math.abs(v);
  let deg = Math.floor(a);
  let min = Math.round((a - deg) * 60 * 1000) / 1000;
  if (min >= 60) {
    deg += 1;
    min = 0;
  }
  return `${deg}°${min.toFixed(3).padStart(6, "0")}′`;
};

/** Grados y minutos: "25°16.874′ S, 57°38.074′ O" (en Paraguay el oeste se escribe O). */
export const degMinCoords = (lon: number, lat: number): string => `${dm(lat)} ${hemi(lat, "N", "S")}, ${dm(lon)} ${hemi(lon, "E", "O")}`;

/** Enlace a Google Maps con la ubicación. */
export const mapsLink = (lon: number, lat: number): string => `https://www.google.com/maps?q=${lat.toFixed(5)},${lon.toFixed(5)}`;

// ---------- Vigor ----------

/** Color de la rampa NDVI (marrón a verde) para un valor de 0 a 1. */
export function ndviColor(v: number): string {
  const cuts = [0.2, 0.4, 0.55, 0.7];
  const i = cuts.findIndex((c) => v < c);
  return NDVI_RAMP[i === -1 ? NDVI_RAMP.length - 1 : i]!;
}

/** Un valor de vigor (NDVI) en una fecha de imagen. */
export interface VigorPoint {
  acquiredAt: number;
  mean: number;
  lowConfidence: boolean;
}

/** Cambio porcentual del vigor del lote contra el promedio de las pasadas más nuevas de la estancia; null sin base. */
export function deltaVsFarm(current: number, farmMeans: number[]): number | null {
  if (farmMeans.length < 2) return null;
  const avg = farmMeans.reduce((a, b) => a + b, 0) / farmMeans.length;
  return avg > 0 ? ((current - avg) / avg) * 100 : null;
}

/** Pasadas de NDVI del lote, de la más vieja a la más nueva. */
export function vigorHistory(db: LocalDb, plotId: string): VigorPoint[] {
  return db.sql
    .all<{ acquired_at: number; mean: number; low_confidence: number }>(
      "SELECT acquired_at, mean, low_confidence FROM plot_index_stats WHERE plot_id = ? AND idx = 'ndvi' AND deleted_at IS NULL ORDER BY acquired_at",
      [plotId],
    )
    .map((r) => ({ acquiredAt: r.acquired_at, mean: r.mean, lowConfidence: !!r.low_confidence }));
}

/** Último NDVI de cada lote (los empleados no reciben estadísticas: el mapa queda vacío). */
export function latestVigorByPlot(db: LocalDb): Map<string, VigorPoint> {
  const rows = db.sql.all<{ plot_id: string; acquired_at: number; mean: number; low_confidence: number }>(
    `SELECT plot_id, acquired_at, mean, low_confidence FROM (
       SELECT plot_id, acquired_at, mean, low_confidence,
              ROW_NUMBER() OVER (PARTITION BY plot_id ORDER BY acquired_at DESC) AS rn
       FROM plot_index_stats WHERE idx = 'ndvi' AND deleted_at IS NULL
     ) WHERE rn = 1`,
  );
  return new Map(rows.map((r) => [r.plot_id, { acquiredAt: r.acquired_at, mean: r.mean, lowConfidence: !!r.low_confidence }]));
}

// ---------- Campañas del lote ----------

/** Una campaña en la rotación de un lote. */
export interface RotationRow {
  seasonId: string;
  seasonName: string;
  crop: string | null;
  variety: string | null;
  plannedSowingDate: string | null;
  sownOn: number | null;
  targetYieldTHa: number | null;
  yieldTHa: number | null;
  harvestTons: number | null;
}

interface SeasonLite {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}
/** Plan de cultivo de un lote en una campaña. */
export interface PlanLite {
  plotId: string;
  seasonId: string;
  crop: string | null;
  variety: string | null;
  plannedSowingDate: string | null;
  sowingDensity: number | null;
  densityUnit: string | null;
  targetYieldTHa: number | null;
}

/** Campañas guardadas en el celular. */
export const localSeasons = (db: LocalDb): SeasonLite[] =>
  db.sql
    .all<{ id: string; name: string; start_date: string | null; end_date: string | null; active: number }>(
      "SELECT id, name, start_date, end_date, active FROM seasons WHERE deleted_at IS NULL ORDER BY active DESC, start_date DESC, created_at DESC",
    )
    .map((r) => ({ id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date, active: !!r.active }));

/** Planes de cultivo guardados en el celular. */
export const localPlans = (db: LocalDb): PlanLite[] =>
  db.sql
    .all<{ plot_id: string; season_id: string; crop: string | null; variety: string | null; planned_sowing_date: string | null; sowing_density: number | null; density_unit: string | null; target_yield_t_ha: number | null }>(
      "SELECT plot_id, season_id, crop, variety, planned_sowing_date, sowing_density, density_unit, target_yield_t_ha FROM plot_seasons WHERE deleted_at IS NULL",
    )
    .map((r) => ({ plotId: r.plot_id, seasonId: r.season_id, crop: r.crop, variety: r.variety, plannedSowingDate: r.planned_sowing_date, sowingDensity: r.sowing_density, densityUnit: r.density_unit, targetYieldTHa: r.target_yield_t_ha }));

/** Historial de un lote solo con lo planificado (sin rinde: ese sale de los registros de cosecha en el servidor). */
export function rotationFromLocal(seasons: SeasonLite[], plans: PlanLite[], plotId: string): RotationRow[] {
  const bySeason = new Map(plans.filter((p) => p.plotId === plotId).map((p) => [p.seasonId, p]));
  return seasons
    .filter((s) => bySeason.has(s.id))
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "") || b.name.localeCompare(a.name))
    .map((s) => {
      const p = bySeason.get(s.id)!;
      return { seasonId: s.id, seasonName: s.name, crop: p.crop, variety: p.variety, plannedSowingDate: p.plannedSowingDate, sownOn: null, targetYieldTHa: p.targetYieldTHa, yieldTHa: null, harvestTons: null };
    });
}

// ---------- Tabla de lotes ----------

/** Criterio de orden de la tabla de lotes. */
export type PlotSort = "name" | "area" | "vigor" | "visit";

/** Fila de la tabla de lotes. */
export interface PlotLine {
  id: string;
  name: string;
  farmId: string;
  kind: "crop" | "pasture";
  crop: string | null;
  areaHa: number;
  vigor: number | null;
  /** Días desde el último registro; null = nunca visitado. */
  visitDays: number | null;
}

/**
 * Orden elegido. Vigor: del más bajo al más alto (lo que preocupa primero), sin dato al final.
 * Visita: más días sin visitar primero, y los nunca visitados antes que todos.
 */
export function sortPlotLines(rows: PlotLine[], by: PlotSort): PlotLine[] {
  const out = [...rows];
  const byName = (a: PlotLine, b: PlotLine) => a.name.localeCompare(b.name, "es");
  switch (by) {
    case "area":
      return out.sort((a, b) => b.areaHa - a.areaHa || byName(a, b));
    case "vigor":
      return out.sort((a, b) => (a.vigor ?? Infinity) - (b.vigor ?? Infinity) || byName(a, b));
    case "visit":
      return out.sort((a, b) => (b.visitDays ?? Infinity) - (a.visitDays ?? Infinity) || byName(a, b));
    default:
      return out.sort(byName);
  }
}

/** Lotes que hace más de `days` días nadie visita (o que nunca se visitaron). */
export const unvisitedOver = (rows: PlotLine[], days: number): PlotLine[] => rows.filter((r) => r.visitDays === null || r.visitDays > days);

/** Superficie por cultivo (los potreros aparte), mayor primero. */
export function areaByCrop(rows: PlotLine[]): { key: string; ha: number; plots: number }[] {
  const m = new Map<string, { ha: number; plots: number }>();
  for (const r of rows) {
    const key = r.kind === "pasture" ? "pasture" : (r.crop ?? "none");
    const cur = m.get(key) ?? { ha: 0, plots: 0 };
    m.set(key, { ha: cur.ha + r.areaHa, plots: cur.plots + 1 });
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.ha - a.ha);
}

// ---------- Registros con filtros ----------

/** Filtros del historial de registros; los campos vacíos no filtran. */
export interface RecordFilter {
  farmId: string;
  authorId: string;
  /** ISO yyyy-mm-dd o "". */
  from: string;
  to: string;
}
/** Filtro que no excluye nada. */
export const NO_RECORD_FILTER: RecordFilter = { farmId: "", authorId: "", from: "", to: "" };

/** Cantidad de filtros activos. */
export const activeFilterCount = (f: RecordFilter): number => [f.farmId, f.authorId, f.from, f.to].filter(Boolean).length;

const DAY = 86_400_000;
/** Medianoche de Asunción (UTC-3) del día ISO, en epoch ms. */
const dayStart = (iso: string): number => Date.parse(`${iso}T00:00:00-03:00`);

/** Registros que cumplen el filtro por estancia, autor y fechas. */
export function filterRecords<R extends { farmId: string; authorId: string; capturedAt: number }>(rows: R[], f: RecordFilter): R[] {
  const from = f.from ? dayStart(f.from) : null;
  const to = f.to ? dayStart(f.to) + DAY : null;
  return rows.filter((r) => (!f.farmId || r.farmId === f.farmId) && (!f.authorId || r.authorId === f.authorId) && (from === null || r.capturedAt >= from) && (to === null || r.capturedAt < to));
}

// ---------- Buscador ----------

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** ¿Todas las palabras de la consulta aparecen en alguno de los textos? Sin tildes ni mayúsculas. */
export function matchesQuery(query: string, ...texts: (string | null | undefined)[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const hay = fold(texts.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}
