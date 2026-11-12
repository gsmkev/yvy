/** Mapa de calor de recorridas (F-06): registros `track` de los últimos 30 días, por estancia y por lote. */
import type { LonLat } from "@yvy/geo";
import { trackLengthM } from "@yvy/geo";
import type { RecordRow } from "./types";

export const TRACK_WINDOW_MS = 30 * 86_400_000;

type TrackRow = Pick<RecordRow, "id" | "kind" | "data" | "plotId" | "capturedAt">;

/** Línea válida (>= 2 posiciones numéricas) de un registro `track`; null si el dato está roto. */
export function trackLine(r: Pick<RecordRow, "kind" | "data">): LonLat[] | null {
  if (r.kind !== "track" || !Array.isArray(r.data?.line)) return null;
  const line = (r.data.line as unknown[]).filter(
    (p): p is LonLat => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number",
  );
  return line.length >= 2 ? line : null;
}

/**
 * Puntos cada `stepM` metros a lo largo de la línea. La línea guardada está simplificada (pocos vértices,
 * tramos largos): sin esto el calor se vería solo en los vértices.
 */
export function densify(line: readonly LonLat[], stepM = 8): LonLat[] {
  const out: LonLat[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.max(1, Math.ceil(trackLengthM([a, b]) / stepM));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Puntos de calor de todas las recorridas dentro de la ventana. Tope para que el mapa no se arrastre. */
export function heatPoints(rows: TrackRow[], now = Date.now(), maxPoints = 40_000): [number, number][] {
  const out: [number, number][] = [];
  for (const r of rows) {
    if (now - r.capturedAt > TRACK_WINDOW_MS) continue;
    const line = trackLine(r);
    if (!line) continue;
    for (const p of densify(line)) {
      if (out.length >= maxPoints) return out;
      out.push(p);
    }
  }
  return out;
}

export interface TrackSummary {
  walks: number;
  km: number;
  /** Recorridas por lote (id → cantidad), solo las que quedaron asignadas a un lote. */
  byPlot: Map<string, number>;
  /** Lotes sin ninguna recorrida en la ventana: "dónde no se camina". */
  unvisited: string[];
}

export function summarizeTracks(rows: TrackRow[], plotIds: string[], now = Date.now()): TrackSummary {
  const byPlot = new Map<string, number>();
  let walks = 0;
  let meters = 0;
  for (const r of rows) {
    if (r.kind !== "track" || now - r.capturedAt > TRACK_WINDOW_MS) continue;
    walks++;
    meters += typeof r.data?.distanceM === "number" ? r.data.distanceM : 0;
    if (r.plotId) byPlot.set(r.plotId, (byPlot.get(r.plotId) ?? 0) + 1);
  }
  return { walks, km: meters / 1000, byPlot, unvisited: plotIds.filter((id) => !byPlot.has(id)) };
}
