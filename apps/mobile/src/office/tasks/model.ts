/** Lógica pura de la pantalla de tareas del equipo: filtros, conteos, agrupado por persona y borrador del formulario. */
import { checklistProgress, dueLabel, isOverdue, parseChecklist, t } from "@yvy/shared";
import type { Task } from "../../db/store/core";

/** Filtro de la lista de tareas. */
export type Filter = "all" | "overdue" | "today" | "done";

/** Campos del formulario de tarea como texto. */
export interface Draft {
  id: string | null;
  title: string;
  assigneeId: string;
  farmId: string;
  plotId: string;
  dueDate: string;
  dueTime: string;
  priority: string;
  recurrence: string;
  kind: string;
  checklist: string;
}

const PRIO_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** Momento de referencia para decidir qué está vencido. */
export interface Clock {
  today: string;
  nowTime: string;
}

/** Cuántas tareas hay en cada filtro. */
export function taskCounts(tasks: Task[], c: Clock): Record<Filter, number> {
  return {
    all: tasks.filter((x) => x.status === "open").length,
    overdue: tasks.filter((x) => isOverdue(x, c.today, c.nowTime)).length,
    today: tasks.filter((x) => x.status === "open" && x.dueDate === c.today).length,
    done: tasks.filter((x) => x.status === "done").length,
  };
}

const matchers: Record<Filter, (x: Task, c: Clock) => boolean> = {
  all: (x) => x.status === "open",
  overdue: (x, c) => isOverdue(x, c.today, c.nowTime),
  today: (x, c) => x.status === "open" && x.dueDate === c.today,
  done: (x) => x.status === "done",
};

const byDue = (a: Task, b: Task) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? "24:00").localeCompare(b.dueTime ?? "24:00") || (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1);

/** Tareas del filtro: las hechas, de la más reciente; el resto, por fecha, hora y prioridad. */
export function tasksFor(filter: Filter, tasks: Task[], c: Clock): Task[] {
  const sorted = tasks.filter((x) => matchers[filter](x, c));
  return sorted.sort(filter === "done" ? (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) : byDue);
}

/** Agrupa por persona asignada, respetando el orden recibido. */
export function groupByAssignee(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>();
  for (const x of tasks) groups.set(x.assigneeId, [...(groups.get(x.assigneeId) ?? []), x]);
  return groups;
}

/** Línea secundaria de una tarea: cuándo, dónde y avance de la lista. */
export function taskSubtitle(x: Task, c: Clock, names: { farm?: string; plot?: string | null }): string {
  const over = isOverdue(x, c.today, c.nowTime);
  const where = [names.farm, names.plot, x.priority === "high" ? t("ui.task.priorityHigh") : null].filter(Boolean).join(", ");
  const when = x.status === "done" ? t("ui.status.done") : [dueLabel(x.dueDate, c.today, over), x.dueTime].filter(Boolean).join(", ");
  const cl = checklistProgress(parseChecklist(x.checklist));
  return [when, where, cl.total ? t("app.common.checklistProgress", cl) : null].filter(Boolean).join(", ");
}

/** Borrador de tarea nueva. */
export function newDraft(today: string, assigneeId: string, farmId: string): Draft {
  return { id: null, title: "", assigneeId, farmId, plotId: "", dueDate: today, dueTime: "", priority: "normal", recurrence: "none", kind: "", checklist: "" };
}

/** Borrador para editar una tarea existente. */
export function editDraft(x: Task): Draft {
  return { id: x.id, title: x.title, assigneeId: x.assigneeId, farmId: x.farmId, plotId: x.plotId ?? "", dueDate: x.dueDate, dueTime: x.dueTime ?? "", priority: x.priority, recurrence: x.recurrence, kind: x.kind ?? "", checklist: "" };
}

/** Primer error de campos obligatorios del borrador, o null si está completo. */
export function draftError(d: Draft): string | null {
  if (!d.title.trim()) return t("office.task.needsTitle");
  if (!d.assigneeId) return t("office.task.needsAssignee");
  if (!d.farmId) return t("office.task.needsFarm");
  if (!d.dueDate) return t("office.task.needsDate");
  if (d.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.dueTime)) return t("office.task.badTime");
  return null;
}
