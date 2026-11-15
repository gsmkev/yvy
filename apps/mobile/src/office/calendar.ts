/** Fechas del calendario semanal. Copia de apps/web/src/lib/calendar.ts y dueLabel.ts (puras). */
import { addDays, t } from "@yvy/shared";
import { fmtIsoDay } from "./taskText";

/** Lunes de la semana de `date` ("YYYY-MM-DD"). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

const RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };
export const sortTasks = <T extends { dueTime: string | null; priority: string }>(l: T[]): T[] =>
  l.slice().sort((a, b) => (a.dueTime ?? "24:00").localeCompare(b.dueTime ?? "24:00") || (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1));

/** Labores de la semana por día; las canceladas no van. */
export function tasksByDay<T extends { dueDate: string; dueTime: string | null; status: string; priority: string }>(tasks: T[], days: string[]): Map<string, T[]> {
  const out = new Map(days.map((d) => [d, [] as T[]]));
  for (const x of tasks) if (x.status !== "cancelled") out.get(x.dueDate)?.push(x);
  for (const [d, l] of out) out.set(d, sortTasks(l));
  return out;
}

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
export const daysFrom = (today: string, iso: string) => dayNum(iso) - dayNum(today);

/** Vencimiento en palabras cuando importa la urgencia; lejos, dd/mm/aaaa. */
export function dueLabel(iso: string, today: string, overdue = false): string {
  const n = daysFrom(today, iso);
  if (n === 0) return overdue ? t("ui.dueLateToday") : t("ui.dueToday");
  if (n === 1) return t("ui.dueTomorrow");
  if (n === -1) return t("ui.dueYesterday");
  if (n < 0) return t("ui.dueLateDays", { n: -n });
  if (n <= 6) return t("ui.dueInDays", { n });
  return fmtIsoDay(iso);
}
