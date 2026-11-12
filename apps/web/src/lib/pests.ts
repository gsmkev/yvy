/** Mapa de focos de plaga (A-42): registros `pest` de los últimos 30 días como puntos coloreados por plaga. */
import { centroidOf, type Area } from "@yvy/geo";
import { BRAND, PEST_THRESHOLDS, PESTS } from "@yvy/shared";
import type { RecordRow } from "./types";

export const PEST_WINDOW_MS = 30 * 86_400_000;

export const PEST_COLORS: Record<(typeof PESTS)[number], string> = {
  chinche: BRAND.alerta,
  oruga: BRAND.trigo,
  roya: BRAND.cielo,
  malezas: BRAND.soja,
  otra: "#6B6F63",
};

export type PestIntensity = "low" | "medium" | "high";

/** Radio del punto en el mapa según la intensidad: cuanto más fuerte el foco, más grande. */
export const PEST_RADIUS: Record<PestIntensity, number> = { low: 5, medium: 7.5, high: 11 };

export interface PestPoint {
  id: string;
  lon: number;
  lat: number;
  color: string;
  pest: (typeof PESTS)[number];
  intensity: PestIntensity;
  radius: number;
  plotId: string | null;
}

/**
 * Intensidad del foco: la que anotó el técnico o, si contó plantas por metro, la comparación con el umbral de
 * la plaga (el doble o más = alta, sobre el umbral = media). Sin ninguna de las dos se toma como media.
 */
export function pestIntensity(data: Record<string, unknown>): PestIntensity {
  const given = data.intensity;
  if (given === "low" || given === "medium" || given === "high") return given;
  const perMeter = typeof data.perMeter === "number" ? data.perMeter : null;
  const limit = PEST_THRESHOLDS[data.pest as string]?.perMeter;
  if (perMeter !== null && limit) return perMeter >= limit * 2 ? "high" : perMeter > limit ? "medium" : "low";
  return "medium";
}

/**
 * Registros de plaga de los últimos 30 días con ubicación: el GPS del registro o, si no hay, el centro
 * del lote. Sin ninguna de las dos, el registro no se puede ubicar y se omite.
 */
export function pestPoints(
  records: Pick<RecordRow, "id" | "kind" | "data" | "lon" | "lat" | "plotId" | "capturedAt">[],
  plots: { id: string; geometry: string }[],
  now = Date.now(),
): PestPoint[] {
  const centers = new Map<string, { lon: number; lat: number }>();
  const centerOf = (plotId: string) => {
    let c = centers.get(plotId);
    if (!c) {
      const p = plots.find((x) => x.id === plotId);
      if (!p) return null;
      c = centroidOf(JSON.parse(p.geometry) as Area);
      centers.set(plotId, c);
    }
    return c;
  };
  const out: PestPoint[] = [];
  for (const r of records) {
    if (r.kind !== "pest" || r.capturedAt < now - PEST_WINDOW_MS) continue;
    const pest = r.data.pest as (typeof PESTS)[number];
    if (!(pest in PEST_COLORS)) continue;
    const at = r.lon !== null && r.lat !== null ? { lon: r.lon, lat: r.lat } : r.plotId ? centerOf(r.plotId) : null;
    if (!at) continue;
    const intensity = pestIntensity(r.data);
    out.push({
      id: r.id,
      lon: at.lon,
      lat: at.lat,
      color: PEST_COLORS[pest],
      pest,
      intensity,
      radius: PEST_RADIUS[intensity],
      plotId: r.plotId,
    });
  }
  return out;
}

/** Cuántos focos hay de cada plaga, de más a menos. */
export const pestCounts = (points: PestPoint[]): { pest: PestPoint["pest"]; n: number }[] => {
  const m = new Map<PestPoint["pest"], number>();
  for (const p of points) m.set(p.pest, (m.get(p.pest) ?? 0) + 1);
  return [...m.entries()].map(([pest, n]) => ({ pest, n })).sort((a, b) => b.n - a.n);
};

const RANK: Record<PestIntensity, number> = { low: 0, medium: 1, high: 2 };

/**
 * Lotes con focos, del más afectado al menos: primero por la intensidad máxima y después por la cantidad de focos.
 * Los focos sin lote no entran (se ven igual en el mapa).
 */
export function pestsByPlot(points: PestPoint[]): { plotId: string; n: number; worst: PestIntensity }[] {
  const m = new Map<string, { plotId: string; n: number; worst: PestIntensity }>();
  for (const p of points) {
    if (!p.plotId) continue;
    const cur = m.get(p.plotId) ?? { plotId: p.plotId, n: 0, worst: "low" as PestIntensity };
    cur.n++;
    if (RANK[p.intensity] > RANK[cur.worst]) cur.worst = p.intensity;
    m.set(p.plotId, cur);
  }
  return [...m.values()].sort((a, b) => RANK[b.worst] - RANK[a.worst] || b.n - a.n);
}
