/** Registro del token de Expo Push para avisos (RF-73). */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { deviceId } from "./sync";
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
