/**
 * Ganadería (ADR 0004, backlog G-*). Constantes y lógica pura compartidas por app, web y Worker.
 * La hacienda de un potrero NO se guarda: se calcula desde el último conteo más los movimientos y la mortandad
 * posteriores (ver computeStock). Los potreros son lotes con kind = "pasture".
 */

/** Categorías de hacienda, en el orden en que se muestran. */
export const HERD_CATEGORIES = ["vaca", "vaquilla", "novillo", "ternero", "toro"] as const;
export type HerdCategory = (typeof HERD_CATEGORIES)[number];

/** Cabezas por categoría. Una categoría ausente vale 0. */
export type HerdCounts = Partial<Record<HerdCategory, number>>;

/** Tope por categoría en un solo registro (evita errores de tipeo como un cero de más). */
export const MAX_HEAD_PER_CATEGORY = 100_000;

export const emptyCounts = (): Record<HerdCategory, number> => ({
  vaca: 0,
  vaquilla: 0,
  novillo: 0,
  ternero: 0,
  toro: 0,
});

export const totalHead = (c: HerdCounts): number => HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0), 0);

/**
 * Unidades animales (UA) por cabeza. VALORES POR DEFECTO A REVISAR POR UN TÉCNICO: son equivalencias generales
 * de la ganadería de cría extensiva (1 UA = vaca adulta seca de 400 kg), no una recomendación para un campo.
 */
export const UA_EQUIVALENTS: Record<HerdCategory, number> = {
  vaca: 1,
  vaquilla: 0.7,
  novillo: 0.8,
  ternero: 0.4,
  toro: 1.3,
};

/** Carga máxima por defecto en UA/ha. VALOR POR DEFECTO A REVISAR; cada estancia lo configura. */
export const DEFAULT_MAX_UA_PER_HA = 1;
export const MAX_UA_PER_HA_LIMITS = { min: 0.1, max: 10 } as const;

export const uaOf = (c: HerdCounts): number => HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0) * UA_EQUIVALENTS[k], 0);

/** UA/ha de un potrero, o null si no tiene superficie. */
export const uaPerHa = (c: HerdCounts, areaHa: number): number | null => (areaHa > 0 ? uaOf(c) / areaHa : null);

export interface CountEvent {
  plotId: string;
  capturedAt: number;
  counts: HerdCounts;
}
export interface MoveEvent {
  /** Origen: null si la hacienda entra de afuera (compra, nacimiento). */
  fromPlotId: string | null;
  /** Destino: null si sale del campo (venta, faena). */
  toPlotId: string | null;
  capturedAt: number;
  counts: HerdCounts;
}
export interface MortalityEvent {
  plotId: string;
  capturedAt: number;
  category: HerdCategory;
  head: number;
}

export interface PlotStock {
  plotId: string;
  counts: Record<HerdCategory, number>;
  total: number;
  /** Fecha del último conteo (manga), o null si nunca se contó: el número sale solo de movimientos. */
  lastCountAt: number | null;
}

/**
 * Hacienda actual por potrero (regla del ADR 0004): último `herd_count` de cada potrero + movimientos de entrada
 * y salida y mortandad posteriores a ese conteo. Un conteo nuevo corrige cualquier error acumulado.
 * Si un potrero nunca se contó, se parte de cero y se aplican todos sus eventos.
 */
export function computeStock(
  plotIds: readonly string[],
  counts: readonly CountEvent[],
  moves: readonly MoveEvent[],
  deaths: readonly MortalityEvent[],
): Map<string, PlotStock> {
  type Step = { at: number; apply: (c: Record<HerdCategory, number>) => void };
  const out = new Map<string, PlotStock>();
  const lastCount = new Map<string, CountEvent>();
  for (const c of counts) {
    const prev = lastCount.get(c.plotId);
    if (!prev || c.capturedAt >= prev.capturedAt) lastCount.set(c.plotId, c);
  }
  const steps = new Map<string, Step[]>();
  const add = (plotId: string, s: Step) => {
    const l = steps.get(plotId);
    if (l) l.push(s);
    else steps.set(plotId, [s]);
  };
  for (const m of moves) {
    if (m.fromPlotId)
      add(m.fromPlotId, {
        at: m.capturedAt,
        apply: (c) => {
          for (const k of HERD_CATEGORIES) c[k] = Math.max(0, c[k] - (m.counts[k] ?? 0));
        },
      });
    if (m.toPlotId)
      add(m.toPlotId, {
        at: m.capturedAt,
        apply: (c) => {
          for (const k of HERD_CATEGORIES) c[k] += m.counts[k] ?? 0;
        },
      });
  }
  for (const d of deaths)
    add(d.plotId, {
      at: d.capturedAt,
      apply: (c) => {
        c[d.category] = Math.max(0, c[d.category] - d.head);
      },
    });
  for (const plotId of plotIds) {
    const base = lastCount.get(plotId);
    const c = emptyCounts();
    if (base) for (const k of HERD_CATEGORIES) c[k] = base.counts[k] ?? 0;
    const since = base?.capturedAt ?? -Infinity;
    const later = (steps.get(plotId) ?? []).filter((s) => s.at > since).sort((a, b) => a.at - b.at);
    for (const s of later) s.apply(c);
    out.set(plotId, { plotId, counts: c, total: totalHead(c), lastCountAt: base?.capturedAt ?? null });
  }
  return out;
}

export interface FarmStock {
  counts: Record<HerdCategory, number>;
  total: number;
  ua: number;
  areaHa: number;
  /** UA/ha sobre la superficie de los potreros con hacienda registrada o con superficie, o null sin superficie. */
  uaPerHa: number | null;
}

/** Totales de la estancia a partir del stock por potrero y su superficie. */
export function farmStock(stock: Iterable<PlotStock>, areaByPlot: ReadonlyMap<string, number>): FarmStock {
  const counts = emptyCounts();
  let areaHa = 0;
  for (const s of stock) {
    for (const k of HERD_CATEGORIES) counts[k] += s.counts[k];
    areaHa += areaByPlot.get(s.plotId) ?? 0;
  }
  const ua = uaOf(counts);
  return { counts, total: totalHead(counts), ua, areaHa, uaPerHa: areaHa > 0 ? ua / areaHa : null };
}

/** Motivos de un movimiento de hacienda. */
export const MOVE_REASONS = ["rotacion", "sanidad", "venta", "compra", "otro"] as const;
export type MoveReason = (typeof MOVE_REASONS)[number];

/** Causas de mortandad (lista cerrada para poder sumar por causa). */
export const MORTALITY_CAUSES = ["enfermedad", "accidente", "parto", "rayo", "sequia", "vibora", "desconocida", "otra"] as const;
export type MortalityCause = (typeof MORTALITY_CAUSES)[number];

/**
 * El potrero de un registro de hacienda es `records.plot_id`. Devuelve el problema (texto en es-PY) o null.
 * Un conteo y una mortandad necesitan potrero; un movimiento necesita origen o destino.
 */
export function livestockPlotProblem(kind: string, plotId: string | null, data: unknown): string | null {
  if ((kind === "herd_count" || kind === "mortality") && !plotId) return "Elegí el potrero";
  if (kind === "herd_move") {
    const to = (data as { toPlotId?: string } | null)?.toPlotId;
    if (!plotId && !to) return "Indicá el potrero de origen o el de destino";
    if (plotId && to && plotId === to) return "El origen y el destino son el mismo potrero";
  }
  return null;
}
