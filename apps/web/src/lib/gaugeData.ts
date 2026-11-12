/** Pluviómetros contra satélite y contra lo normal, por mes y por campaña (C-05, C-06). */
import { addDays, localDate } from "@yvy/shared";
import { dayToMs } from "./format";
import { gaugeBetween, normalBetween, rainBetween, type ClimateData } from "./reportsData";

export type GaugeClimate = Omit<ClimateData, "gauge"> & { gauge: { capturedAt: number; mm: number; poiId?: string | null }[] };

/** Las campañas agrícolas de Paraguay arrancan el 1 de septiembre. */
export function campaignStart(today: string = localDate(Date.now())): string {
  const y = Number(today.slice(0, 4));
  return today >= `${y}-09-01` ? `${y}-09-01` : `${y - 1}-09-01`;
}

export interface GaugeRow {
  /** "AAAA-MM", o "season" para el total de la campaña. */
  key: string;
  from: string;
  to: string;
  gaugeMm: number | null;
  satMm: number | null;
  normalMm: number | null;
}

const lastDayOfMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Última fecha con lluvia de satélite: el tramo comparado termina ahí para que las tres columnas cubran los mismos días. */
export function lastSatDate(daily: ClimateData["daily"], today: string): string {
  let last = "";
  for (const d of daily) if (d.source.startsWith("chirps") && d.precipMm !== null && d.date > last) last = d.date;
  return last || today;
}

/**
 * Filas por mes y total de campaña para un pluviómetro (`poiId`), o para la lluvia anotada sin pluviómetro (null).
 * `from` es el inicio de la campaña; `cutoff`, el último día comparable.
 */
export function gaugeTable(
  c: GaugeClimate,
  poiId: string | null,
  from: string,
  cutoff: string,
  tz: string,
): { months: GaugeRow[]; season: GaugeRow } {
  const records = c.gauge.filter((g) => (g.poiId ?? null) === poiId);
  const row = (key: string, a: string, b: string): GaugeRow => ({
    key,
    from: a,
    to: b,
    gaugeMm: gaugeBetween(records, dayToMs(a, tz) ?? 0, dayToMs(b, tz, true) ?? 0),
    satMm: rainBetween(c.daily, a, b),
    normalMm: normalBetween(c.climatology, a, b),
  });
  const months: GaugeRow[] = [];
  for (let m = from.slice(0, 7); m <= cutoff.slice(0, 7); m = addDays(`${m}-28`, 5).slice(0, 7)) {
    const a = m === from.slice(0, 7) ? from : `${m}-01`;
    const b = lastDayOfMonth(m) < cutoff ? lastDayOfMonth(m) : cutoff;
    months.push(row(m, a, b));
  }
  return { months, season: row("season", from, cutoff) };
}

/** Diferencia en % del pluviómetro frente al satélite; null si falta alguno o el satélite es 0. */
export const gaugeVsSat = (r: Pick<GaugeRow, "gaugeMm" | "satMm">): number | null =>
  r.gaugeMm === null || !r.satMm ? null : ((r.gaugeMm - r.satMm) / r.satMm) * 100;

export const hasUnassignedRain = (c: GaugeClimate): boolean => c.gauge.some((g) => !g.poiId);
