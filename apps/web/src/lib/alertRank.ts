const SEVERITY_RANK: Record<string, number> = { warning: 0, watch: 1, info: 2 };

/** Avisos: lo urgente arriba (alerta, atención, información) y, dentro de cada nivel, el más nuevo primero. */
export function sortAlerts<T extends { severity: string; validFrom: number }>(list: T[]): T[] {
  return list
    .slice()
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || b.validFrom - a.validFrom);
}

/** Para revisar: primero lo que puede costar plata (dosis, rinde), después lo que suele ser un error de carga. */
const ODDITY_RANK: Record<string, number> = { dose_out_of_range: 0, yield_impossible: 1, rain_high: 2, pest_off_season: 3 };

export function sortReview<T extends { capturedAt: number; oddities: { rule: string }[] }>(list: T[]): T[] {
  const rank = (x: T) => Math.min(...x.oddities.map((o) => ODDITY_RANK[o.rule] ?? 9), 9);
  return list.slice().sort((a, b) => rank(a) - rank(b) || b.capturedAt - a.capturedAt);
}
