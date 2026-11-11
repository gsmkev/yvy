/**
 * Preferencias de notificación por usuario (backlog U-29): por tipo de aviso, push y email, y un horario de
 * silencio para el push. Todo está prendido por defecto; los cambios se guardan completos (no hay "diferencias").
 */
import { z } from "zod";
import { ALERT_KINDS } from "./schema";
import type { Role } from "./schema";
import { isTimeOfDay } from "./tasks";

export type NotifyKind = (typeof ALERT_KINDS)[number];
export type NotifyChannel = "push" | "email";

const channels = z.object({ push: z.boolean(), email: z.boolean() });
const hhmm = z.string().refine(isTimeOfDay, "Hora inválida (HH:MM)");

export const notificationPrefsSchema = z.object({
  kinds: z.object({
    frost: channels,
    excess_rain: channels,
    drought: channels,
    fire: channels,
    pest_threshold: channels,
    water_low: channels,
    heat_stress: channels,
  }),
  /** Horario de silencio: el push que cae adentro espera a que termine. Puede cruzar la medianoche. */
  quiet: z
    .object({ enabled: z.boolean(), start: hhmm, end: hhmm })
    .refine((q) => !q.enabled || q.start !== q.end, "El inicio y el fin del silencio no pueden ser iguales"),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  kinds: Object.fromEntries(ALERT_KINDS.map((k) => [k, { push: true, email: true }])) as NotificationPrefs["kinds"],
  quiet: { enabled: false, start: "21:00", end: "06:00" },
};

/** Lee el JSON guardado completando lo que falte con los valores por defecto (un tipo de aviso nuevo entra prendido). */
export const parseNotificationPrefs = (json: string | null | undefined): NotificationPrefs => {
  try {
    const raw = JSON.parse(json || "{}") as Partial<NotificationPrefs>;
    const kinds = { ...DEFAULT_NOTIFICATION_PREFS.kinds };
    for (const k of ALERT_KINDS) {
      const c = channels.safeParse({ ...kinds[k], ...(raw.kinds?.[k] ?? {}) });
      if (c.success) kinds[k] = c.data;
    }
    const q = notificationPrefsSchema.shape.quiet.safeParse({
      ...DEFAULT_NOTIFICATION_PREFS.quiet,
      ...(raw.quiet ?? {}),
    });
    return { kinds, quiet: q.success ? q.data : DEFAULT_NOTIFICATION_PREFS.quiet };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
};

/** ¿Este usuario quiere este aviso por este canal? */
export const wantsNotification = (p: NotificationPrefs, kind: NotifyKind, channel: NotifyChannel): boolean =>
  p.kinds[kind]?.[channel] !== false;

/** ¿`time` ("HH:MM", hora local) cae adentro del horario de silencio? */
export const inQuietHours = (q: NotificationPrefs["quiet"], time: string): boolean => {
  if (!q.enabled || q.start === q.end) return false;
  return q.start < q.end ? time >= q.start && time < q.end : time >= q.start || time < q.end;
};

/**
 * Qué avisos y por qué canal le llegan a un rol (RF-73): dueño, administrador y agrónomo reciben todo por push y
 * email; el empleado solo helada y fuego de sus lotes, por push.
 */
export const notifyOptionsFor = (role: Role): { kinds: readonly NotifyKind[]; email: boolean } =>
  role === "worker" ? { kinds: ["frost", "fire"], email: false } : { kinds: ALERT_KINDS, email: true };
