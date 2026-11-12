import { addDays } from "@yvy/shared";

/** Lunes de la semana de `date` ("YYYY-MM-DD"). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, -((dow + 6) % 7));
}

/** Los 7 días (lunes a domingo) de la semana que empieza en `monday`. */
export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * T-04: labores de la semana agrupadas por día. Las canceladas no se muestran; dentro del día salen primero las que
 * tienen hora (por hora) y después las del día entero, por prioridad.
 */
export function tasksByDay<T extends { dueDate: string; dueTime: string | null; status: string; priority: string }>(
  tasks: T[],
  days: string[],
): Map<string, T[]> {
  const rank: Record<string, number> = { high: 0, normal: 1, low: 2 };
  const out = new Map(days.map((d) => [d, [] as T[]]));
  for (const x of tasks) if (x.status !== "cancelled") out.get(x.dueDate)?.push(x);
  for (const list of out.values())
    list.sort(
      (a, b) =>
        (a.dueTime ?? "24:00").localeCompare(b.dueTime ?? "24:00") || (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1),
    );
  return out;
}
