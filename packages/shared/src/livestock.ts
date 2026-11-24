/**
 * Ganadería. Constantes y lógica pura compartidas por app, web y Worker.
 * La hacienda de un potrero NO se guarda: se calcula desde el último conteo más los movimientos y la mortandad
 * posteriores (ver computeStock). Los potreros son lotes con kind = "pasture".
 */

import { HERD_CATEGORIES, type HerdCategory } from "./herd-categories";
import type { PastureClass, PastureLoads, ProductionSystem } from "./production";

export { HERD_CATEGORIES, type HerdCategory };

/** Cabezas por categoría. Una categoría ausente vale 0. */
export type HerdCounts = Partial<Record<HerdCategory, number>>;

/** Tope por categoría en un solo registro (evita errores de tipeo como un cero de más). */
export const MAX_HEAD_PER_CATEGORY = 100_000;

/** Conteo en cero de todas las categorías de hacienda. */
export const emptyCounts = (): Record<HerdCategory, number> => ({
  vaca: 0,
  vaquilla: 0,
  novillo: 0,
  ternero: 0,
  toro: 0,
});

/** Total de cabezas de un conteo. */
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
/** Rango permitido para la carga máxima configurable (UA/ha). */
export const MAX_UA_PER_HA_LIMITS = { min: 0.1, max: 10 } as const;

/** Unidades animales (UA) de un conteo según `UA_EQUIVALENTS`. */
export const uaOf = (c: HerdCounts): number => HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0) * UA_EQUIVALENTS[k], 0);

/** UA/ha de un potrero, o null si no tiene superficie. */
export const uaPerHa = (c: HerdCounts, areaHa: number): number | null => (areaHa > 0 ? uaOf(c) / areaHa : null);

/** Conteo de la hacienda de un potrero (la manga): reemplaza lo calculado hasta ese momento. */
export interface CountEvent {
  plotId: string;
  capturedAt: number;
  counts: HerdCounts;
}
/** Movimiento de hacienda entre potreros, o desde/hacia fuera del campo. */
export interface MoveEvent {
  /** Origen: null si la hacienda entra de afuera (compra, nacimiento). */
  fromPlotId: string | null;
  /** Destino: null si sale del campo (venta, faena). */
  toPlotId: string | null;
  capturedAt: number;
  counts: HerdCounts;
}
/** Muertes de una categoría en un potrero. */
export interface MortalityEvent {
  plotId: string;
  capturedAt: number;
  category: HerdCategory;
  head: number;
}

/** Hacienda calculada de un potrero. */
export interface PlotStock {
  plotId: string;
  counts: Record<HerdCategory, number>;
  total: number;
  /** Fecha del último conteo (manga), o null si nunca se contó: el número sale solo de movimientos. */
  lastCountAt: number | null;
}

/**
 * Hacienda actual por potrero: último `herd_count` de cada potrero + movimientos de entrada
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

/** Hacienda total de la estancia y su carga. */
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
/** Motivo de un movimiento de hacienda. */
export type MoveReason = (typeof MOVE_REASONS)[number];

/** Niveles de un registro de agua que disparan el aviso `water_low`. */
export const WATER_LOW_LEVELS = ["low", "dry"] as const;

/** Puntos de interés cuyo nivel se registra y entra al aviso de seca: aguadas y tajamares, bebederos y molinos. */
export const WATER_POI_KINDS = ["water", "trough", "mill"] as const;
/** ¿El tipo de punto de interés lleva registro de nivel de agua? */
export const isWaterPoi = (kind: string): boolean => (WATER_POI_KINDS as readonly string[]).includes(kind);

/** Causas de mortandad (lista cerrada para poder sumar por causa). */
export const MORTALITY_CAUSES = ["enfermedad", "accidente", "parto", "rayo", "sequia", "vibora", "desconocida", "otra"] as const;
/** Causa de mortandad. */
export type MortalityCause = (typeof MORTALITY_CAUSES)[number];

/** Motivos de un tratamiento sanitario y de una campaña planificada. */
export const HEALTH_REASONS = ["aftosa", "brucelosis", "carbunclo", "garrapata", "desparasitacion", "otro"] as const;
/** Motivo de un tratamiento o campaña sanitaria. */
export type HealthReason = (typeof HEALTH_REASONS)[number];

/**
 * El potrero de un registro de hacienda es `records.plot_id`. Devuelve el problema (texto en es-PY) o null.
 * Un conteo y una mortandad necesitan potrero; un movimiento necesita origen o destino.
 */
export function livestockPlotProblem(kind: string, plotId: string | null, data: unknown): string | null {
  if ((kind === "herd_count" || kind === "mortality" || kind === "theft" || kind === "supplement") && !plotId) return "Elegí el potrero";
  if (kind === "herd_move") {
    const to = (data as { toPlotId?: string } | null)?.toPlotId;
    if (!plotId && !to) return "Indicá el potrero de origen o el de destino";
    if (plotId && to && plotId === to) return "El origen y el destino son el mismo potrero";
  }
  return null;
}

/** Respuesta de GET /org/farms/:id/stock. */
export interface PlotStockRow {
  plotId: string;
  name: string;
  areaHa: number;
  counts: Record<HerdCategory, number>;
  total: number;
  ua: number;
  uaPerHa: number | null;
  lastCountAt: number | null;
  overLimit: boolean;
  /** Tipo de pastura (del texto del potrero o el de la estancia) y carga recomendada. */
  pastureClass: PastureClass;
  recommendedUaPerHa: number;
  recommendedUa: number;
  /** UA actuales menos las recomendadas: positivo = sobran, negativo = faltan. */
  diffUa: number;
}

/** Respuesta del stock de hacienda de una estancia: por potrero, total, carga recomendada y estado de la carga. */
export interface FarmStockResponse {
  maxUaPerHa: number;
  maxUaIsDefault: boolean;
  /** Sistema productivo de la estancia (null = sin elegir), tipo de pastura por defecto y cargas propias. */
  system: ProductionSystem | null;
  pastureDefault: PastureClass;
  pastureLoads: PastureLoads;
  /** La recomendación de hoy es la de invierno (30 % menos). */
  winter: boolean;
  plots: PlotStockRow[];
  farm: {
    counts: Record<HerdCategory, number>;
    total: number;
    ua: number;
    areaHa: number;
    uaPerHa: number | null;
    overLimit: boolean;
  };
  /** Equivalencias usadas: valores por defecto a revisar por un técnico. */
  uaEquivalents: Record<HerdCategory, number>;
  /** Eventos que no entraron por pasar el tope de lectura (0 = el cálculo está completo). */
  truncated: boolean;
}

// ---------- Avisos de abigeato ----------

/** Un aviso de abigeato, tal como lo lista GET /org/farms/:id/theft. */
export interface TheftRow {
  id: string;
  plotId: string | null;
  plotName: string | null;
  /** Cuándo se notó el faltante (capturedAt del registro). */
  capturedAt: number;
  category: HerdCategory;
  head: number;
  /** Fecha de la denuncia (epoch ms) y número, o null si todavía no se hizo. */
  reportedAt: number | null;
  policeReport: string | null;
  note: string | null;
}

/** Respuesta del listado de avisos de abigeato del período `from`..`to`, con totales. */
export interface TheftResponse {
  from: number;
  to: number;
  rows: TheftRow[];
  totals: {
    head: number;
    byCategory: Record<HerdCategory, number>;
    /** Avisos sin número de denuncia: es lo que falta completar. */
    withoutReport: number;
  };
  truncated: boolean;
}
