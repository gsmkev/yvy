/** Hoy para oficina: tareas del equipo que vencen hoy o ya vencieron (las de la propia persona van aparte). Lógica pura. */
import { isDueToday } from "@yvy/shared";

interface TeamTask {
  id: string;
  assigneeId: string | null;
  status: string;
  dueDate: string;
  deletedAt?: number | null;
}

/** Vencidas primero (la más vieja arriba), después las de hoy; sin las de `userId`. */
export function teamTasksDue<T extends TeamTask>(rows: T[], userId: string, today: string): T[] {
  return rows
    .filter((r) => r.assigneeId !== userId && isDueToday(r, today))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Indica si la tarea venció antes de `today` (fecha ISO). */
export const isOverdue = (r: Pick<TeamTask, "dueDate">, today: string): boolean => r.dueDate < today;
