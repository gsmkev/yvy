/**
 * Reproducción del rodeo de cría (G-20): servicio, tacto, parición y destete, con sus índices.
 * Lógica pura compartida por el Worker y la web.
 */

export const REPRO_EVENTS = ["service", "pregnancy_check", "calving", "weaning"] as const;
export type ReproEvent = (typeof REPRO_EVENTS)[number];

export const SERVICE_METHODS = ["natural", "ia"] as const;
export type ServiceMethod = (typeof SERVICE_METHODS)[number];

export interface ReproRecord {
  event: ReproEvent;
  /** Vacas servidas, tactadas o que parieron; terneros destetados en un destete. */
  head: number;
  /** Tacto: cuántas de las tactadas están preñadas. */
  pregnant?: number;
  /** Parición: terneros nacidos vivos. Si falta, se cuenta uno por vaca. */
  calves?: number;
}

export interface ReproIndices {
  services: number;
  checked: number;
  pregnant: number;
  calvedCows: number;
  calvesBorn: number;
  weaned: number;
  /** Preñez = preñadas / tactadas. */
  pregnancyPct: number | null;
  /** Parición = terneros nacidos vivos / vacas servidas. */
  calvingPct: number | null;
  /** Destete = terneros destetados / terneros nacidos vivos. */
  weaningPct: number | null;
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/**
 * Índices de un período. Se calculan con los totales del período, no evento por evento: un servicio de abril y una
 * parición de enero no se emparejan, así que para un índice confiable conviene mirar una campaña de monta completa
 * (parición y destete se completan meses después del servicio). Pueden pasar de 100 % si el período no coincide.
 */
export function reproIndices(records: readonly ReproRecord[]): ReproIndices {
  let services = 0;
  let checked = 0;
  let pregnant = 0;
  let calvedCows = 0;
  let calvesBorn = 0;
  let weaned = 0;
  for (const r of records) {
    if (r.event === "service") services += r.head;
    else if (r.event === "pregnancy_check") {
      checked += r.head;
      pregnant += Math.min(r.pregnant ?? 0, r.head);
    } else if (r.event === "calving") {
      calvedCows += r.head;
      calvesBorn += r.calves ?? r.head;
    } else if (r.event === "weaning") weaned += r.head;
  }
  return {
    services,
    checked,
    pregnant,
    calvedCows,
    calvesBorn,
    weaned,
    pregnancyPct: pct(pregnant, checked),
    calvingPct: pct(calvesBorn, services),
    weaningPct: pct(weaned, calvesBorn),
  };
}

export interface ReproRow {
  id: string;
  plotId: string | null;
  plotName: string | null;
  capturedAt: number;
  event: ReproEvent;
  head: number;
  method: ServiceMethod | null;
  pregnant: number | null;
  calves: number | null;
  tag: string | null;
}

/** Respuesta de GET /org/farms/:id/reproduction. */
export interface ReproductionResponse {
  from: number;
  to: number;
  indices: ReproIndices;
  rows: ReproRow[];
  truncated: boolean;
}
