/** Hápticos cortos. Nunca rompen nada: en web o sin motor de vibración no hacen nada. */
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function tap(): void {
  if (Platform.OS === "web") return;
  try {
    void Haptics.selectionAsync().catch(() => {});
  } catch {
    /* sin háptico */
  }
}

export function success(): void {
  if (Platform.OS === "web") return;
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    /* sin háptico */
  }
}
