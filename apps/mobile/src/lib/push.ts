/** Registro del token de Expo Push para avisos (RF-73). */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { deviceId, syncNow } from "./sync";
import { api } from "./session";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerDevice(): Promise<void> {
  let pushToken: string | null = null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("avisos", {
        name: "Avisos",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (Device.isDevice && projectId) {
      const perm = await Notifications.requestPermissionsAsync();
      if (perm.granted) pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
  } catch {
    /* sin push no se frena nada */
  }
  await api("POST", "/devices", {
    id: deviceId(),
    platform: Platform.OS === "ios" ? "ios" : "android",
    appVersion: Constants.expoConfig?.version ?? null,
    pushToken,
  }).catch(() => {});
}

let lastHandled: string | null = null;

/** Tocar un aviso abre Hoy con ese aviso resaltado (también si la app estaba cerrada). */
function openAlert(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) return;
  const key = response.notification.request.identifier;
  if (key === lastHandled) return;
  lastHandled = key;
  const alertId = (response.notification.request.content.data as { alertId?: string } | undefined)?.alertId;
  router.navigate({ pathname: "/(tabs)", params: alertId ? { alertId } : {} });
  syncNow(); // por si el aviso todavía no bajó
}

export function useNotificationTap(): void {
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(openAlert).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(openAlert);
    return () => sub.remove();
  }, []);
}
