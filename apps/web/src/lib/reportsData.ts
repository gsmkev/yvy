/** Datos y cálculos de los informes de campaña, del banco y de la exportación (R-03, R-04, R-09). */
import { addDays, localDate } from "@yvy/shared";
import { get } from "./api";

export interface ClimateData {
  daily: { date: string; source: string; precipMm: number | null }[];
  climatology: { dayOfYear: number; variable: string; mean: number | null }[];
  gauge: { capturedAt: number; mm: number }[];
}

export interface NdviPoint {
  acquiredAt: number;
  mean: number;
  p10: number;
  p90: number;
  validPct: number;
}
export interface NdviData {
  series: NdviPoint[];
  farmAvg: { acquiredAt: number; mean: number }[];
  current: NdviPoint | null;
  deltaVsFarmPct: number | null;
}

export const fetchClimate = (farmId: string, days: number) =>
  get<ClimateData>(`/org/farms/${farmId}/climate?days=${Math.min(Math.max(Math.round(days), 1), 400)}`);
export const fetchNdvi = (plotId: string) => get<NdviData>(`/org/plots/${plotId}/ndvi`);

export const dayOfYear = (date: string): number =>
  Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1;

/** Lluvia por satélite entre dos fechas (CHIRPS; si falta, otra fuente). null si no hay ningún dato. */
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

export const gaugeBetween = (g: ClimateData["gauge"], fromMs: number, toMs: number): number | null => {
  const rows = g.filter((x) => x.capturedAt >= fromMs && x.capturedAt <= toMs);
  return rows.length ? rows.reduce((a, x) => a + x.mm, 0) : null;
};

/** Inicio de campaña: fecha de siembra, o 180 días atrás si no hay. */
export function seasonStart(sowingDate: string | null, today = localDate(Date.now())): string {
  const fallback = addDays(today, -180);
  if (!sowingDate || sowingDate > today) return fallback;
  return sowingDate < addDays(today, -365) ? addDays(today, -365) : sowingDate;
}

export interface VigorSummary {
  n: number;
  last: number | null;
  lastAt: number | null;
  max: number | null;
  min: number | null;
  mean: number | null;
}

export function vigorSummary(series: NdviPoint[]): VigorSummary {
  if (!series.length) return { n: 0, last: null, lastAt: null, max: null, min: null, mean: null };
  const sorted = [...series].sort((a, b) => a.acquiredAt - b.acquiredAt);
  const means = sorted.map((p) => p.mean);
  const last = sorted[sorted.length - 1]!;
  return {
    n: sorted.length,
    last: last.mean,
    lastAt: last.acquiredAt,
    max: Math.max(...means),
    min: Math.min(...means),
    mean: means.reduce((a, b) => a + b, 0) / means.length,
  };
}

/** Ejecuta `fn` sobre cada elemento con a lo sumo `limit` pedidos en paralelo. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
