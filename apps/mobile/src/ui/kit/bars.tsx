/** Barras de estado: sincronización, demo y el aviso breve. */
import { ActivityIndicator, Pressable, View } from "react-native";
import { CloudOff } from "lucide-react-native";
import { t } from "@yvy/shared";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { syncNow, useSyncStatus } from "../../lib/sync";
import { useToast } from "../../lib/toast";
import { C, T } from "../theme";
import { Text } from "./controls";
import { s } from "./styles";

/** Barra de estado de sincronización: solo aparece cuando hay algo que decir. */
export function SyncBar() {
  const st = useSyncStatus();
  if (st.phase === "idle" && st.online && st.pending === 0 && !st.error) return null;
  const text =
    st.phase === "syncing"
      ? t("sync.syncing")
      : !st.online
        ? st.pending === 0
          ? t("sync.offlineNone")
          : st.pending === 1
            ? t("sync.offlineOne")
            : t("sync.offline", { count: st.pending })
        : st.error
          ? t("sync.failed")
          : st.pending === 1
            ? t("sync.pendingOne")
            : t("sync.pending", { count: st.pending });
  const warn = !st.online || !!st.error;
  return (
    <Pressable
      onPress={syncNow}
      accessibilityRole="button"
      accessibilityLabel={`${text}. ${t("sync.syncNow")}`}
      style={[s.bar, { backgroundColor: warn ? C.atencionSuave : C.accionSuave }]}
    >
      {st.phase === "syncing" ? (
        <ActivityIndicator size="small" color={C.accion} />
      ) : warn ? (
        <CloudOff size={16} color={C.atencion} strokeWidth={2} />
      ) : null}
      <Text style={[T.smallMedium, { color: warn ? C.atencion : C.accionOscuro }]}>{text}</Text>
    </Pressable>
  );
}

/** Franja fina arriba mientras se mira la estancia de ejemplo (solo lectura). "Salir" cierra esa sesión. */
export function DemoBar({ onLeave }: { onLeave: () => void }) {
  return (
    <View accessibilityRole="alert" style={s.demoBar}>
      <Text style={[T.smallMedium, { color: C.papel, flexShrink: 1 }]}>{t("ui.publicDemoNotice")}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t("office.demoExit")} onPress={onLeave} hitSlop={10} style={{ minHeight: 32, justifyContent: "center" }}>
        <Text style={[T.smallMedium, { color: C.papel, textDecorationLine: "underline" }]}>{t("office.demoExit")}</Text>
      </Pressable>
    </View>
  );
}

/** Confirmación breve al pie de cualquier pantalla (se monta una sola vez, en el layout raíz). */
export function Toast() {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={[s.toast, { paddingBottom: 14 + insets.bottom }]}>
      <Text style={[T.bodyMedium, { color: C.blanco }]}>{toast.text}</Text>
    </View>
  );
}
