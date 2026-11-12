/**
 * Pastoreo y suplementación (gan-p2: G-04, G-05, G-31). Lógica pura compartida por el Worker y la web.
 * Todos los coeficientes son VALORES POR DEFECTO A REVISAR POR UN TÉCNICO: son referencias generales de pasturas
 * tropicales para cría y engorde extensivos, no una recomendación para un campo en particular.
 */
// ---------- Suplementación y sal mineral (G-31) ----------

export const SUPPLEMENT_TYPES = ["sal_mineral", "sal_proteinada", "balanceado", "silaje", "heno", "otro"] as const;
export type SupplementType = (typeof SUPPLEMENT_TYPES)[number];

/** Tope de kilos en un solo registro (evita errores de tipeo). */
export const MAX_SUPPLEMENT_KG = 100_000;

/**
 * Consumo de referencia de sal mineral en g/cabeza/día. VALOR POR DEFECTO A REVISAR: depende de la fórmula
 * (las más concentradas se consumen menos) y del estado del pasto.
 */
export const MINERAL_SALT_REFERENCE_G = { min: 60, max: 100 } as const;

export interface SupplementEvent {
  plotId: string;
  capturedAt: number;
  type: SupplementType;
  kg: number;
}

export interface SupplementPlotRow {
  plotId: string;
  name: string;
  /** Cabezas actuales del potrero (del stock calculado); 0 si no hay datos. */
  head: number;
  totalKg: number;
  byType: Partial<Record<SupplementType, number>>;
  lastAt: number | null;
  /** g/cabeza/día de todo lo suplementado en la ventana, o null si no hay cabezas. Aproximado: usa la hacienda de hoy. */
  gPerHeadDay: number | null;
  /** g/cabeza/día de sal mineral, o null si no hay cabezas o no se dio sal. */
  saltGPerHeadDay: number | null;
  /** Comparación de la sal con MINERAL_SALT_REFERENCE_G. */
  saltStatus: "low" | "ok" | "high" | null;
}

export interface SupplementResponse {
  from: number;
  to: number;
  days: number;
  plots: SupplementPlotRow[];
  totals: { kg: number; byType: Partial<Record<SupplementType, number>> };
  reference: typeof MINERAL_SALT_REFERENCE_G;
  truncated: boolean;
}

const DAY_MS = 86_400_000;

export function saltStatus(gPerHeadDay: number | null): "low" | "ok" | "high" | null {
  if (gPerHeadDay === null) return null;
  if (gPerHeadDay < MINERAL_SALT_REFERENCE_G.min) return "low";
  if (gPerHeadDay > MINERAL_SALT_REFERENCE_G.max) return "high";
  return "ok";
}

/**
 * Totales por potrero de lo suplementado entre `from` y `to`. `plots` son los potreros a mostrar (siempre salen,
 * aunque no tengan registros) con su hacienda actual.
 */
export function summarizeSupplements(
  plots: readonly { plotId: string; name: string; head: number }[],
  events: readonly SupplementEvent[],
  from: number,
  to: number,
): Pick<SupplementResponse, "days" | "plots" | "totals"> {
  const days = Math.max(1, Math.round((to - from) / DAY_MS));
  const byPlot = new Map<string, SupplementEvent[]>();
  for (const e of events) {
    if (e.capturedAt < from || e.capturedAt > to) continue;
    const l = byPlot.get(e.plotId);
    if (l) l.push(e);
    else byPlot.set(e.plotId, [e]);
  }
  const totals: Partial<Record<SupplementType, number>> = {};
  let totalKg = 0;
  const rows: SupplementPlotRow[] = plots.map((p) => {
    const evs = byPlot.get(p.plotId) ?? [];
    const byType: Partial<Record<SupplementType, number>> = {};
    let kg = 0;
    let lastAt: number | null = null;
    for (const e of evs) {
      byType[e.type] = round1((byType[e.type] ?? 0) + e.kg);
      totals[e.type] = round1((totals[e.type] ?? 0) + e.kg);
      kg += e.kg;
      if (lastAt === null || e.capturedAt > lastAt) lastAt = e.capturedAt;
    }
    totalKg += kg;
    const perHead = (k: number) => (p.head > 0 && k > 0 ? Math.round((k * 1000) / (p.head * days)) : null);
    const salt = perHead(byType.sal_mineral ?? 0);
    return {
      plotId: p.plotId,
      name: p.name,
      head: p.head,
      totalKg: round1(kg),
      byType,
      lastAt,
      gPerHeadDay: perHead(kg),
      saltGPerHeadDay: salt,
      saltStatus: saltStatus(salt),
    };
  });
  return { days, plots: rows, totals: { kg: round1(totalKg), byType: totals } };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
