import { isOverdue as taskOverdue, localDate, localTime } from "@yvy/shared";
import type { Task } from "../../lib/types";

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export type TaskFilter = "all" | "overdue";

/** Filtra, ordena (fecha, hora, prioridad) y agrupa las tareas: pendientes por responsable y hechas aparte. */
export function organizeTasks(tasks: Task[], filter: TaskFilter) {
  const today = localDate(Date.now());
  const nowTime = localTime(Date.now());
  const isOverdue = (x: Task) => taskOverdue(x, today, nowTime);
  const shown = tasks.filter(
    (x) => x.status !== "cancelled" && (x.status === "open" || x.dueDate >= localDate(Date.now() - 7 * 86_400_000)),
  );
  const nOverdue = shown.filter(isOverdue).length;
  const sorted = (filter === "overdue" ? shown.filter(isOverdue) : shown)
    .slice()
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        (a.dueTime ?? "24:00").localeCompare(b.dueTime ?? "24:00") ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    );
  // Las hechas van aparte, plegadas al final
  const visible = sorted.filter((x) => x.status !== "done");
  const done = sorted.filter((x) => x.status === "done").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const byAssignee = new Map<string, Task[]>();
  for (const x of visible)
    byAssignee.set(x.assigneeName ?? x.assigneeId, [...(byAssignee.get(x.assigneeName ?? x.assigneeId) ?? []), x]);
  const nToday = visible.filter((x) => x.dueDate === today).length;
  return { today, isOverdue, nOverdue, sorted, visible, done, byAssignee, nToday };
}
export type Organized = ReturnType<typeof organizeTasks>;
