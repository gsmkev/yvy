/** Datos del indicador EUDR (S-30), compartidos por la pantalla y el PDF. */
import { tk } from "./i18n";
import type { EudrPlot, EudrResponse } from "./types";

/**
 * Umbrales del método. Son indicativos y deben coincidir con las constantes de
 * workers-py/yvy_workers/jobs/eudr.py (el texto del método los muestra tal cual).
 */
export const EUDR_METHOD = {
  forestNdviMin: 0.6,
  forestNdmiMin: 0.1,
  lossNdviMax: 0.5,
  lossNdviDrop: 0.2,
  minPatchHa: 0.5,
} as const;

export const fmtRatio = (n: number) => String(n).replace(".", ",");

/** "Sin cambio", "Posible pérdida de bosque: 3,2 ha" o "Sin datos suficientes por nubes". */
export const statusText = (status: string, lossHa: number) =>
  tk(`ui.eudrStatus_${status}`, { ha: fmtRatio(Math.round(lossHa * 100) / 100) });

export interface EudrSummary {
  plots: number;
  withLoss: number;
  noData: number;
  forestRefHa: number;
  lossHa: number;
  refYear: number | null;
  curYear: number | null;
  /** Fechas de la primera y la última escena de cada compuesto (el rango más amplio entre los lotes). */
  refFromAt: number | null;
  refToAt: number | null;
  curFromAt: number | null;
  curToAt: number | null;
  refScenes: number;
  curScenes: number;
}

const min = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
const max = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

export function summarize(d: EudrResponse): EudrSummary {
  const out: EudrSummary = {
    plots: d.plots.length,
    withLoss: 0,
    noData: 0,
    forestRefHa: 0,
    lossHa: 0,
    refYear: null,
    curYear: null,
    refFromAt: null,
    refToAt: null,
    curFromAt: null,
    curToAt: null,
    refScenes: 0,
    curScenes: 0,
  };
  for (const p of d.plots) {
    if (p.status === "possible_loss") out.withLoss += 1;
    if (p.status === "no_data") out.noData += 1;
    out.forestRefHa += p.forestRefHa;
    out.lossHa += p.lossHa;
    out.refYear = p.refYear;
    out.curYear = p.curYear;
    out.refFromAt = min(out.refFromAt, p.refFromAt);
    out.refToAt = max(out.refToAt, p.refToAt);
    out.curFromAt = min(out.curFromAt, p.curFromAt);
    out.curToAt = max(out.curToAt, p.curToAt);
    out.refScenes = Math.max(out.refScenes, p.refScenes);
    out.curScenes = Math.max(out.curScenes, p.curScenes);
  }
  out.forestRefHa = Math.round(out.forestRefHa * 100) / 100;
  out.lossHa = Math.round(out.lossHa * 100) / 100;
  return out;
}

/** Polígonos de cambio de todos los lotes, con id para el mapa (formato de FarmMap.problemAreas). */
export function changeAreas(plots: EudrPlot[]): { id: string; geometry: string }[] {
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
