/**
 * Cálculos puros de lluvia para los informes de oficina: satélite (CHIRPS), normal, pluviómetro, por mes y por campaña.
 * Copia de apps/web/src/lib/reportsData.ts y gaugeData.ts (sin red ni Intl: Paraguay es UTC-3 todo el año).
 */
import { addDays, localDate } from "@yvy/shared";

export interface ClimateData {
  daily: { date: string; source: string; precipMm: number | null; tminC?: number | null; tmaxC?: number | null; soilMoisture0_7?: number | null }[];
  climatology: { dayOfYear: number; variable: string; mean: number | null }[];
  gauge: { capturedAt: number; mm: number; poiId?: string | null }[];
}

export const dayOfYear = (date: string): number =>
  Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1;

/** Lluvia por día: CHIRPS final reemplaza a la preliminar; si falta, otra fuente. */
export function rainByDate(daily: ClimateData["daily"]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of daily) {
    if (d.precipMm === null) continue;
    if (d.source === "chirps" || !m.has(d.date)) m.set(d.date, d.precipMm);
  }
  return m;
}

/** Lluvia por satélite entre dos fechas; null si no hay ningún dato. */
export function rainBetween(daily: ClimateData["daily"], from: string, to: string): number | null {
  const byDate = new Map<string, number>();
  for (const d of daily) {
    if (d.date < from || d.date > to || d.precipMm === null) continue;
    if (d.source.startsWith("chirps") || !byDate.has(d.date)) byDate.set(d.date, d.precipMm);
  }
  return byDate.size ? [...byDate.values()].reduce((a, b) => a + b, 0) : null;
}

/** Lluvia normal (media histórica) entre dos fechas; solo cuenta días con climatología. */
export function normalBetween(clim: ClimateData["climatology"], from: string, to: string): number | null {
  const means = new Map<number, number>();
  for (const c of clim) if (c.variable === "precip" && c.mean !== null) means.set(c.dayOfYear, c.mean);
  let sum = 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const m = means.get(dayOfYear(d));
    if (m !== undefined) {
      sum += m;
      n++;
    }
  }
  return n ? sum : null;
}

const gaugeBetween = (g: ClimateData["gauge"], fromMs: number, toMs: number): number | null => {
  const rows = g.filter((x) => x.capturedAt >= fromMs && x.capturedAt <= toMs);
  return rows.length ? rows.reduce((a, x) => a + x.mm, 0) : null;
};

/** Inicio / fin de un día "AAAA-MM-DD" en epoch ms, hora de Paraguay (UTC-3). */
const dayToMs = (day: string, end = false): number => Date.parse(`${day}T${end ? "23:59:59" : "00:00:00"}-03:00`);

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

/** Última fecha con lluvia de satélite: el tramo comparado termina ahí. */
export function lastSatDate(daily: ClimateData["daily"], today: string): string {
  let last = "";
  for (const d of daily) if (d.source.startsWith("chirps") && d.precipMm !== null && d.date > last) last = d.date;
  return last || today;
}

/** Filas por mes y total de campaña de un pluviómetro (`poiId`) o de la lluvia sin pluviómetro (null). */
export function gaugeTable(c: ClimateData, poiId: string | null, from: string, cutoff: string): { months: GaugeRow[]; season: GaugeRow } {
  const records = c.gauge.filter((g) => (g.poiId ?? null) === poiId);
  const row = (key: string, a: string, b: string): GaugeRow => ({
    key,
    from: a,
    to: b,
    gaugeMm: gaugeBetween(records, dayToMs(a), dayToMs(b, true)),
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

export const hasUnassignedRain = (c: ClimateData): boolean => c.gauge.some((g) => !g.poiId);

/** Lunes de la semana de `iso` (la semana laboral empieza el lunes). */
export const mondayOf = (iso: string): string => {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
};
