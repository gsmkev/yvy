/**
 * Tareas recurrentes (PRD RF-20/21, Fase 3). Al completar una tarea diaria o semanal se crea la siguiente.
 * El celular la crea localmente sin red y el servidor la crea al recibir el push: las dos usan el mismo
 * id determinístico, así que nunca se duplica.
 */
import { z } from "zod";

export const DEFAULT_TZ = "America/Asuncion";

/** Fecha de calendario "YYYY-MM-DD" en la zona horaria dada. */
export const localDate = (ms: number, tz: string = DEFAULT_TZ): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    // Paraguay usa UTC-3 todo el año desde 2024.
    return new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
  }
};

/** Hora "HH:MM" en la zona horaria dada. */
export const localTime = (ms: number, tz: string = DEFAULT_TZ): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
      new Date(ms),
    );
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return `${get("hour")}:${get("minute")}`;
  } catch {
    return new Date(ms - 3 * 3_600_000).toISOString().slice(11, 16);
  }
};

export const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Próxima fecha: avanza el intervalo hasta quedar después del día en que se completó. */
export const nextDueDate = (
  dueDate: string,
  recurrence: "none" | "daily" | "weekly",
  completedOn: string,
): string | null => {
  if (recurrence === "none") return null;
  const step = recurrence === "daily" ? 1 : 7;
  let next = addDays(dueDate, step);
  while (next <= completedOn) next = addDays(next, step);
  return next;
};

/** Hash de 128 bits (cyrb128) → UUID con formato v8. Determinístico y sin crypto (corre en Hermes). */
export const deterministicUuid = (input: string): string => {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((h) => (h >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export const nextOccurrenceId = (taskId: string): string => deterministicUuid(`next:${taskId}`);

/** Tareas visibles en "Hoy": abiertas con fecha ≤ hoy. */
export const isDueToday = (t: { status: string; dueDate: string; deletedAt?: number | null }, today: string): boolean =>
  t.status === "open" && !t.deletedAt && t.dueDate <= today;

/** Comentario de una tarea. Vive en tasks.comments (JSON); el autor se guarda con su nombre de ese momento. */
export const taskCommentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  at: z.number().int(),
  text: z.string().min(1),
});
export type TaskComment = z.infer<typeof taskCommentSchema>;

/** Lee el JSON de comentarios sin romper si está dañado. */
export const parseTaskComments = (json: string | null | undefined): TaskComment[] => {
  try {
    const r = z.array(taskCommentSchema).safeParse(JSON.parse(json || "[]"));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
};

/** "HH:MM" válida (00:00 a 23:59). */
export const isTimeOfDay = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Ya venció: el día pasó, o es hoy y la hora límite ya pasó. */
export const isOverdue = (
  t: { status: string; dueDate: string; dueTime?: string | null },
  today: string,
  nowTime: string,
): boolean => t.status === "open" && (t.dueDate < today || (t.dueDate === today && !!t.dueTime && t.dueTime < nowTime));

/**
 * T-03: qué tiene que traer el registro con el que se cierra una tarea de cada tipo. Lo exige el servidor al recibir
 * el cierre (`tasks.status` → `done`) y la app lo pide antes de guardar. Las tareas sin tipo no piden nada.
 */
export interface CloseRequirements {
  photo: boolean;
  location: boolean;
}
export const TASK_CLOSE_REQUIREMENTS: Readonly<Record<string, CloseRequirements>> = {
  application: { photo: true, location: true },
  fertilization: { photo: true, location: true },
  scouting: { photo: true, location: true },
  pest: { photo: true, location: true },
  sowing: { photo: false, location: true },
  harvest: { photo: false, location: true },
  crop_status: { photo: true, location: false },
  pasture_status: { photo: true, location: false },
};

export const closeRequirements = (kind: string | null | undefined): CloseRequirements | null =>
  (kind && TASK_CLOSE_REQUIREMENTS[kind]) || null;

/** Lo que falta para poder cerrar: `record` (no hay registro), `photo` o `location`; null si cumple. */
export const closeProblem = (
  req: CloseRequirements,
  record: { lon: number | null; lat: number | null } | null,
  photos: number,
): "record" | "photo" | "location" | null => {
  if (!record) return "record";
  if (req.photo && photos < 1) return "photo";
  if (req.location && (record.lon === null || record.lat === null)) return "location";
  return null;
};
