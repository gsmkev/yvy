/** Qué recordatorios locales hay que programar (F-16). Puro y probable: no toca expo-notifications. */
import { localDate } from "@yvy/shared";
import type { LocalDb } from "../db/store";

export const REMINDER_HOUR = 7;
/** Días hacia adelante que se programan; se rehacen después de cada sincronización. */
export const REMINDER_DAYS = 3;

export interface ReminderPlan {
  at: Date;
  count: number;
  titles: string[];
}

/** Un aviso por día a las 7:00 (hora del celular) con las tareas abiertas de ese día; sin tareas, sin aviso. */
export function planReminders(db: LocalDb, userId: string, now = Date.now()): ReminderPlan[] {
  const out: ReminderPlan[] = [];
  const base = new Date(now);
  for (let i = 0; i < REMINDER_DAYS; i++) {
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, REMINDER_HOUR, 0, 0, 0);
    if (at.getTime() <= now) continue;
    const open = db.tasksToday(userId, localDate(at.getTime())).filter((t) => t.status === "open");
    if (open.length) out.push({ at, count: open.length, titles: open.slice(0, 3).map((t) => t.title) });
  }
  return out;
}
