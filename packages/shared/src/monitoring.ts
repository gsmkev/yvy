/**
 * Plantillas de monitoreo por cultivo (F-13) y cuentas del monitoreo por estaciones (F-12).
 * UMBRALES POR DEFECTO A REVISAR POR UN AGRÓNOMO: son referencias generales de manejo integrado de plagas,
 * no una recomendación para un lote concreto. La estancia puede decidir otros valores.
 */
import type { PESTS } from "./records";

export const MONITOR_UNITS = ["perMeter", "percentPlants", "percentLeafArea"] as const;
export type MonitorUnit = (typeof MONITOR_UNITS)[number];

export interface MonitorItem {
  /** Clave estable guardada en el registro (counts/averages). Su etiqueta es app.monitor_<key>. */
  key: string;
  /** Grupo del enum de plagas con que se guarda el registro. */
  pest: (typeof PESTS)[number];
  unit: MonitorUnit;
  /** Valor por defecto del umbral de daño, en la misma unidad. */
  threshold: number;
  /** Paso de los botones + y − al contar. */
  step: number;
}

export const MONITOR_TEMPLATES = {
  soja: [
    { key: "chinche_verde", pest: "chinche", unit: "perMeter", threshold: 2, step: 1 },
    { key: "chinche_vaina", pest: "chinche", unit: "perMeter", threshold: 2, step: 1 },
    { key: "chinche_marron", pest: "chinche", unit: "perMeter", threshold: 2, step: 1 },
    { key: "oruga_bolillera", pest: "oruga", unit: "perMeter", threshold: 4, step: 1 },
    { key: "oruga_medidora", pest: "oruga", unit: "perMeter", threshold: 20, step: 1 },
    { key: "roya", pest: "roya", unit: "percentLeafArea", threshold: 5, step: 1 },
  ],
  maiz: [
    { key: "cogollero", pest: "oruga", unit: "percentPlants", threshold: 20, step: 5 },
    { key: "chicharrita", pest: "otra", unit: "percentPlants", threshold: 10, step: 5 },
  ],
} as const satisfies Record<string, readonly MonitorItem[]>;

export type MonitorCrop = keyof typeof MONITOR_TEMPLATES;
export const MONITOR_CROPS = Object.keys(MONITOR_TEMPLATES) as MonitorCrop[];

export const monitorTemplate = (crop: string | null | undefined): readonly MonitorItem[] | null =>
  crop && crop in MONITOR_TEMPLATES ? MONITOR_TEMPLATES[crop as MonitorCrop] : null;

export interface StationCounts {
  counts: Record<string, number>;
}

/** Promedio por plaga de las estaciones cargadas. Lo que no se contó en una estación cuenta como 0. */
export function stationAverages(stations: readonly StationCounts[], template: readonly MonitorItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!stations.length) return out;
  for (const item of template) {
    const sum = stations.reduce((acc, st) => acc + (st.counts[item.key] ?? 0), 0);
    out[item.key] = Math.round((sum / stations.length) * 100) / 100;
  }
  return out;
}

export interface ThresholdResult {
  key: string;
  average: number;
  threshold: number;
  /** promedio / umbral */
  ratio: number;
  /** Estrictamente sobre el umbral. */
  over: boolean;
}

export function compareThresholds(averages: Record<string, number>, template: readonly MonitorItem[]): ThresholdResult[] {
  return template
    .filter((i) => averages[i.key] !== undefined)
    .map((i) => {
      const average = averages[i.key]!;
      return { key: i.key, average, threshold: i.threshold, ratio: average / i.threshold, over: average > i.threshold };
    });
}

/** La plaga que más se acerca (o pasa) su umbral: es la que le da nombre al registro. */
export function worstItem(averages: Record<string, number>, template: readonly MonitorItem[]): ThresholdResult | null {
  const all = compareThresholds(averages, template);
  if (!all.length) return null;
  return all.reduce((a, b) => (b.ratio > a.ratio ? b : a));
}

/** Campos clásicos del registro de plaga a partir de las estaciones, para que alertas y listados sigan andando. */
export function summarizeStations(stations: readonly StationCounts[], template: readonly MonitorItem[]) {
  const averages = stationAverages(stations, template);
  const worst = worstItem(averages, template);
  const item = worst ? template.find((i) => i.key === worst.key)! : template[0]!;
  const intensity: "low" | "medium" | "high" = !worst || worst.ratio < 0.5 ? "low" : worst.ratio <= 1 ? "medium" : "high";
  return {
    averages,
    worst,
    pest: item.pest,
    intensity,
    perMeter: item.unit === "perMeter" && worst ? worst.average : undefined,
  };
}
