/** Tipo de respuesta del calendario sanitario. */

import type { HEALTH_REASONS, HerdCategory } from "../livestock";
import type { SanitaryState } from "../sanitary";

/** Evento sanitario planificado con su estado y tareas generadas. */
export interface SanitaryEventRow {
  id: string;
  farmId: string | null;
  reason: (typeof HEALTH_REASONS)[number];
  plannedDate: string;
  categories: HerdCategory[];
  product: string | null;
  note: string | null;
  tasksCreated: number;
  state: SanitaryState;
  doneAt: number | null;
}
