/** Datos y cálculos de los informes de campaña, del banco y de la exportación (R-03, R-04, R-09). */
import { addDays, localDate, type ClimateData } from "@yvy/shared";
import { get } from "./api";

export interface NdviPoint {
  acquiredAt: number;
  mean: number;
  p10: number;
  p90: number;
  validPct: number;
}
interface NdviData {
  series: NdviPoint[];
  farmAvg: { acquiredAt: number; mean: number }[];
  current: NdviPoint | null;
  deltaVsFarmPct: number | null;
}

export const fetchClimate = (farmId: string, days: number) =>
  get<ClimateData>(`/org/farms/${farmId}/climate?days=${Math.min(Math.max(Math.round(days), 1), 400)}`);
export const fetchNdvi = (plotId: string) => get<NdviData>(`/org/plots/${plotId}/ndvi`);

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
