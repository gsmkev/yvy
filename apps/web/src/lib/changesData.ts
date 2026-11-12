/** Datos de "Cambios en el terreno": área quemada (S-20) y cambio de cobertura (S-31). Todo indicativo. */
import type { AnalysisPlot, BurnedMetrics, CoverMetrics } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BurnedEvent {
  /** Fecha del primer foco (AAAA-MM-DD): identifica el incendio. */
  refKey: string;
  eventAt: number;
  fromAt: number | null;
  toAt: number | null;
  burnedHa: number;
  highHa: number;
  /** Lotes con superficie quemada, los más afectados primero. */
  plots: AnalysisPlot<BurnedMetrics>[];
  /** Lotes cercanos al foco donde no se detectó quemado. */
  unaffected: number;
  noData: number;
}

/** Agrupa los resultados por incendio, el más reciente primero. */
export function burnedEvents(rows: AnalysisPlot<BurnedMetrics>[]): BurnedEvent[] {
  const by = new Map<string, AnalysisPlot<BurnedMetrics>[]>();
  for (const r of rows) by.set(r.refKey, [...(by.get(r.refKey) ?? []), r]);
  return [...by.entries()]
    .map(([refKey, plots]) => {
      const sorted = [...plots].sort((a, b) => b.metrics.burnedHa - a.metrics.burnedHa || a.plotName.localeCompare(b.plotName));
      return {
        refKey,
        eventAt: plots[0]!.metrics.eventAt,
        fromAt: plots[0]!.fromAt,
        toAt: plots[0]!.toAt,
        burnedHa: round2(plots.reduce((a, p) => a + p.metrics.burnedHa, 0)),
        highHa: round2(plots.reduce((a, p) => a + p.metrics.highHa, 0)),
        plots: sorted.filter((p) => p.metrics.burnedHa > 0),
        unaffected: plots.filter((p) => p.metrics.burnedHa === 0 && p.validPct >= 60).length,
        noData: plots.filter((p) => p.metrics.burnedHa === 0 && p.validPct < 60).length,
      };
    })
    .sort((a, b) => b.refKey.localeCompare(a.refKey));
}

/** Polígonos de cambio con id para el mapa (formato de FarmMap.problemAreas). */
export function analysisAreas(plots: { plotId: string; changes: string }[]): { id: string; geometry: string }[] {
  const out: { id: string; geometry: string }[] = [];
  for (const p of plots) {
    let fc: { features?: { geometry: unknown }[] };
    try {
      fc = JSON.parse(p.changes) as typeof fc;
    } catch {
      continue;
    }
    (fc.features ?? []).forEach((f, i) => out.push({ id: `${p.plotId}-${i}`, geometry: JSON.stringify(f.geometry) }));
  }
  return out;
}

export interface CoverSummary {
  from: CoverMetrics["from"];
  to: CoverMetrics["to"];
  forestToPasture: number;
  forestToCrop: number;
  forestToOther: number;
  /** Bosque que ya no lo es en la segunda fecha. */
  forestLostHa: number;
  fromAt: number | null;
  toAt: number | null;
}

const sumClasses = (list: CoverMetrics["from"][]): CoverMetrics["from"] => ({
  forest: round2(list.reduce((a, c) => a + c.forest, 0)),
  pasture: round2(list.reduce((a, c) => a + c.pasture, 0)),
  crop: round2(list.reduce((a, c) => a + c.crop, 0)),
  other: round2(list.reduce((a, c) => a + c.other, 0)),
});

/** Totales de la estancia para un cambio de cobertura (los lotes de una misma referencia). */
export function summarizeCover(plots: AnalysisPlot<CoverMetrics>[]): CoverSummary {
  const m = plots.map((p) => p.metrics);
  const f2p = round2(m.reduce((a, x) => a + x.forestToPasture, 0));
  const f2c = round2(m.reduce((a, x) => a + x.forestToCrop, 0));
  const f2o = round2(m.reduce((a, x) => a + x.forestToOther, 0));
  return {
    from: sumClasses(m.map((x) => x.from)),
    to: sumClasses(m.map((x) => x.to)),
    forestToPasture: f2p,
    forestToCrop: f2c,
    forestToOther: f2o,
    forestLostHa: round2(f2p + f2c + f2o),
    fromAt: plots.reduce<number | null>((a, p) => (p.fromAt === null ? a : a === null ? p.fromAt : Math.min(a, p.fromAt)), null),
    toAt: plots.reduce<number | null>((a, p) => (p.toAt === null ? a : a === null ? p.toAt : Math.max(a, p.toAt)), null),
  };
}

/** "2020-12-31_2026-10-31" -> { from, to }. */
export function parseCoverKey(refKey: string): { from: string; to: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(refKey);
  return m ? { from: m[1]!, to: m[2]! } : null;
}

/** Referencias de cambio de cobertura distintas, la más nueva primero. */
export const coverKeys = (plots: { refKey: string }[]): string[] => [...new Set(plots.map((p) => p.refKey))].sort().reverse();
