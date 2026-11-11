/** Mapa de focos de plaga (A-42): registros `pest` de los últimos 30 días como puntos coloreados por plaga. */
import { centroidOf, type Area } from "@yvy/geo";
import { BRAND, PESTS } from "@yvy/shared";
import type { RecordRow } from "./types";

export const PEST_WINDOW_MS = 30 * 86_400_000;

export const PEST_COLORS: Record<(typeof PESTS)[number], string> = {
  chinche: BRAND.alerta,
  oruga: BRAND.trigo,
  roya: BRAND.cielo,
  malezas: BRAND.soja,
  otra: "#6B6F63",
};

export interface PestPoint {
  id: string;
  lon: number;
  lat: number;
  color: string;
  pest: (typeof PESTS)[number];
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
    if (at) out.push({ id: r.id, lon: at.lon, lat: at.lat, color: PEST_COLORS[pest], pest });
  }
  return out;
}

/** Cuántos focos hay de cada plaga, de más a menos. */
export const pestCounts = (points: PestPoint[]): { pest: PestPoint["pest"]; n: number }[] => {
  const m = new Map<PestPoint["pest"], number>();
  for (const p of points) m.set(p.pest, (m.get(p.pest) ?? 0) + 1);
  return [...m.entries()].map(([pest, n]) => ({ pest, n })).sort((a, b) => b.n - a.n);
};
