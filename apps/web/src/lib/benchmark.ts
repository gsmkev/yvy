/** R-08: lectura de la comparación anónima con la zona. */
export type Verdict = "above" | "below" | "same";

/** Diferencia relativa (en fracción de la mediana) por debajo de la cual se dice "parecido". */
export const SAME_BAND = 0.1;

export function compareToZone(own: number | null, median: number | null): Verdict | null {
  if (own === null || median === null) return null;
  if (median === 0) return own === 0 ? "same" : "above";
  const d = (own - median) / Math.abs(median);
  return Math.abs(d) < SAME_BAND ? "same" : d > 0 ? "above" : "below";
}
