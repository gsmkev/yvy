/**
 * Plan reproductivo: de la estación de servicio salen las fechas de cada etapa del ciclo.
 * Valores ORIENTATIVOS (cada campo ajusta): servicio desde el 1 de noviembre por 90 días, parición 283 días después
 * de cada día de servicio, tacto 60 días después del fin del servicio, destete a los 7 meses.
 */
import { addDays } from "./tasks";

/** Inicio de la estación de servicio por defecto ("MM-DD"). */
export const DEFAULT_BREEDING_START = "11-01";
/** Duración por defecto de la estación de servicio, en días. */
export const DEFAULT_BREEDING_DAYS = 90;
/** Rango permitido para la duración de la estación de servicio, en días. */
export const BREEDING_DAYS_LIMITS = { min: 30, max: 180 } as const;
/** Etapas, en días y meses. */
export const REPRO_PLAN = { prepDays: 45, tactoAfterServiceDays: 60, gestationDays: 283, weaningMonths: 7, vaccineFromMonths: 3, vaccineToMonths: 8 } as const;

/** Etapas del plan reproductivo, en orden cronológico. */
export const PLAN_STAGE_IDS = ["prep", "service", "tacto", "calving", "heifer_vaccine", "weaning"] as const;
/** Etapa del plan reproductivo. */
export type PlanStageId = (typeof PLAN_STAGE_IDS)[number];

/** Fechas de una etapa del plan reproductivo. */
export interface PlanStage {
  id: PlanStageId;
  /** "YYYY-MM-DD". Una etapa de un solo día tiene from = to. */
  from: string;
  to: string;
}

/** "MM-DD" válido (no cuenta el 29 de febrero: la estación arranca todos los años). */
export const isBreedingStart = (v: string): boolean => {
  const m = /^(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(2025, month, 0)).getUTCDate();
};

/** Suma meses a una fecha; si el día no existe en el mes destino, queda en el último día de ese mes. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Etapas del ciclo cuyo servicio arranca en `cycleYear` (puede cruzar el año), en orden cronológico. */
export function reproPlan(
  cycleYear: number,
  start: string = DEFAULT_BREEDING_START,
  days: number = DEFAULT_BREEDING_DAYS,
  weaningMonths: number = REPRO_PLAN.weaningMonths,
): PlanStage[] {
  const serviceFrom = `${cycleYear}-${isBreedingStart(start) ? start : DEFAULT_BREEDING_START}`;
  const serviceTo = addDays(serviceFrom, days - 1);
  const calvingFrom = addDays(serviceFrom, REPRO_PLAN.gestationDays);
  const calvingTo = addDays(serviceTo, REPRO_PLAN.gestationDays);
  const tacto = addDays(serviceTo, REPRO_PLAN.tactoAfterServiceDays);
  const stages: PlanStage[] = [
    { id: "prep", from: addDays(serviceFrom, -REPRO_PLAN.prepDays), to: addDays(serviceFrom, -1) },
    { id: "service", from: serviceFrom, to: serviceTo },
    { id: "tacto", from: tacto, to: tacto },
    { id: "calving", from: calvingFrom, to: calvingTo },
    { id: "heifer_vaccine", from: addMonths(calvingFrom, REPRO_PLAN.vaccineFromMonths), to: addMonths(calvingTo, REPRO_PLAN.vaccineToMonths) },
    { id: "weaning", from: addMonths(calvingFrom, weaningMonths), to: addMonths(calvingTo, weaningMonths) },
  ];
  return stages.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/**
 * Ciclo actual: el último cuyo período de preparación ya empezó. Los ciclos se solapan (el destete de uno cae
 * cuando ya se prepara el siguiente), así que cuenta el que empezó más recientemente.
 */
export function currentCycleYear(today: string, start: string = DEFAULT_BREEDING_START, days: number = DEFAULT_BREEDING_DAYS): number {
  const year = Number(today.slice(0, 4));
  for (const y of [year + 1, year, year - 1]) {
    if (reproPlan(y, start, days)[0]!.from <= today) return y;
  }
  return year - 2;
}

/** Desde cuándo y hasta cuándo se miran los indicadores del ciclo: del inicio del servicio al fin del destete. */
export function cycleWindow(cycleYear: number, start?: string, days?: number): { from: string; to: string } {
  const st = reproPlan(cycleYear, start, days);
  return { from: st.find((s) => s.id === "service")!.from, to: st[st.length - 1]!.to };
}

/** Respuesta de GET /org/farms/:id/repro-plan. */
export interface ReproPlanResponse {
  breedingStart: string;
  breedingDays: number;
  /** true si la estancia no configuró nada y se usan los valores por defecto. */
  isDefault: boolean;
  cycleYear: number;
  indicators: import("./production").Indicator[];
}

/** Etapas del plan que todavía no terminaron (las que vale la pena convertir en tarea). */
export const upcomingStages = (stages: readonly PlanStage[], today: string): PlanStage[] => stages.filter((s) => s.to >= today);
/** Fecha de la tarea de una etapa: hoy si ya empezó, el comienzo si todavía no. */
export const stageTaskDate = (s: PlanStage, today: string): string => (s.from > today ? s.from : today);
