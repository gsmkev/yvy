/**
 * Calendario sanitario (G-10): eventos planificados de la organización (campañas de vacunación, tratamientos).
 * Un evento está hecho cuando existe un registro `health` que le corresponde (mismo motivo, misma estancia si el
 * evento es de una sola, y cargado dentro de la ventana del evento). Lógica pura: la usan el Worker y la web.
 */
import { z } from "zod";
import { HEALTH_REASONS, HERD_CATEGORIES } from "./livestock";

/** Días antes de la fecha planificada en que un tratamiento ya cuenta como cumplido (se adelantó la campaña). */
export const SANITARY_EARLY_DAYS = 15;

export const sanitaryEventSchema = z.object({
  reason: z.enum(HEALTH_REASONS),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Vacío = toda la organización. */
  farmId: z.string().uuid().nullish(),
  categories: z.array(z.enum(HERD_CATEGORIES)).max(HERD_CATEGORIES.length).default([]),
  product: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(500).nullish(),
  /** Crear una tarea para cada empleado asignado a un potrero. */
  createTasks: z.boolean().default(true),
});
export type SanitaryEventInput = z.infer<typeof sanitaryEventSchema>;

export type SanitaryState = "done" | "overdue" | "upcoming";

export interface SanitaryEventLite {
  reason: string;
  plannedDate: string;
  farmId: string | null;
}
export interface HealthRecordLite {
  farmId: string;
  reason: string;
  capturedAt: number;
}

const dayStart = (iso: string) => Date.parse(`${iso}T00:00:00-03:00`);

/** Primer registro `health` que cumple el evento, o null. */
export function matchingHealth<R extends HealthRecordLite>(ev: SanitaryEventLite, records: readonly R[]): R | null {
  const from = dayStart(ev.plannedDate) - SANITARY_EARLY_DAYS * 86_400_000;
  let best: R | null = null;
  for (const r of records) {
    if (r.reason !== ev.reason || r.capturedAt < from) continue;
    if (ev.farmId && r.farmId !== ev.farmId) continue;
    if (!best || r.capturedAt < best.capturedAt) best = r;
  }
  return best;
}

/** hecho si hay registro que corresponde; vencido si la fecha ya pasó (hoy cuenta como pendiente). */
export function sanitaryState(ev: SanitaryEventLite, records: readonly HealthRecordLite[], today: string): SanitaryState {
  if (matchingHealth(ev, records)) return "done";
  return ev.plannedDate < today ? "overdue" : "upcoming";
}
