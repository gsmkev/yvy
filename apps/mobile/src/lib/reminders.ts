/**
 * Recordatorios locales de tareas (F-16): notificaciones programadas en el celular, sin internet.
 * Se rehacen después de cada sincronización; el interruptor está en Más.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { t } from "@yvy/shared";
import { getDb } from "./db";
import { planReminders } from "./reminders-plan";
import { getSession } from "./session";

const KV_OFF = "reminders_off";
const KV_IDS = "reminder_ids";

export const remindersEnabled = (): boolean => getDb().getKv(KV_OFF) !== "1";

async function cancelOwn(): Promise<void> {
  const db = getDb();
  const ids = JSON.parse(db.getKv(KV_IDS) ?? "[]") as string[];
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  db.setKv(KV_IDS, null);
}

/** Cancela los avisos anteriores y programa los de hoy y los próximos días. Nunca lanza. */
export async function rescheduleReminders(): Promise<void> {
  try {
    await cancelOwn();
    const session = getSession();
    if (!session || !remindersEnabled()) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("recordatorios", { name: "Recordatorios", importance: Notifications.AndroidImportance.DEFAULT });
    }
    const ids: string[] = [];
    for (const p of planReminders(getDb(), session.user.id)) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: p.count === 1 ? t("app.reminderOne") : t("app.reminderMany", { n: p.count }),
          body: p.titles.join(" · "),
          data: { reminder: true },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: "recordatorios" },
      });
      ids.push(id);
    }
    getDb().setKv(KV_IDS, JSON.stringify(ids));
  } catch {
    /* sin recordatorios no se frena nada */
  }
}

/** Interruptor de Más. Al prender pide permiso; devuelve el estado final. */
export async function setRemindersEnabled(on: boolean): Promise<boolean> {
  if (on) {
    const perm = await Notifications.requestPermissionsAsync().catch(() => null);
    if (!perm?.granted) return false;
  }
  getDb().setKv(KV_OFF, on ? null : "1");
  await rescheduleReminders();
  return on;
}
