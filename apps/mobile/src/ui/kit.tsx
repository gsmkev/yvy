import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SYNC_BORDER, t } from "@yvy/shared";
import { syncNow, useSyncStatus } from "../lib/sync";
import { C, TOUCH } from "./theme";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === "primary" ? C.soja : variant === "danger" ? C.alerta : C.white;
  const fg = variant === "ghost" ? C.surco : C.white;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1, borderWidth: variant === "ghost" ? 1 : 0 },
        style,
      ]}
    >
      <Text style={[styles.btnText, { color: fg }]}>
        {icon ? `${icon}  ` : ""}
        {title}
      </Text>
    </Pressable>
  );
}

/** Indicador siempre visible (RF-43): SIN SEÑAL · N PENDIENTES / SINCRONIZANDO… / SINCRONIZADO · HH:MM */
export function SyncBar() {
  const s = useSyncStatus();
  const time = s.lastSyncAt
    ? new Date(s.lastSyncAt).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const label =
    s.phase === "syncing"
      ? t("sync.syncing")
      : !s.online || s.pending > 0
        ? t("sync.offline", { count: s.pending })
        : t("sync.synced", { time });
  const color = s.phase === "syncing" ? C.cielo : !s.online || s.pending > 0 ? C.trigo : C.soja;
  return (
    <Pressable
      onPress={syncNow}
      accessibilityRole="button"
      accessibilityLabel={t("sync.syncNow")}
      style={[styles.bar, { backgroundColor: C.surco }]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.barText}>{label}</Text>
      {s.phase === "syncing" ? (
        <ActivityIndicator color={C.lino} size="small" />
      ) : (
        <Text style={styles.barAction}>↻</Text>
      )}
    </Pressable>
  );
}

/** Firma visual (RF-33): pendiente = borde punteado trigo; sincronizado = sólido soja. */
export function SyncCard({
  pending,
  children,
  onPress,
}: {
  pending: boolean;
  children: ReactNode;
  onPress?: () => void;
}) {
  const b = pending ? SYNC_BORDER.pending : SYNC_BORDER.synced;
  return (
    <Pressable onPress={onPress} style={[styles.card, { borderColor: b.color, borderStyle: b.style }]}>
      {children}
    </Pressable>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => <Text style={styles.h1}>{children}</Text>;
export const Muted = ({ children }: { children: ReactNode }) => <Text style={styles.muted}>{children}</Text>;

export const styles = StyleSheet.create({
  btn: {
    minHeight: TOUCH,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderColor: C.line,
  },
  btnText: { fontSize: 18, fontWeight: "600" },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, minHeight: 44 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  barText: { color: C.lino, fontWeight: "700", letterSpacing: 0.5, flex: 1 },
  barAction: { color: C.lino, fontSize: 20 },
  card: { backgroundColor: C.white, borderWidth: 2, borderRadius: 12, padding: 14, marginBottom: 10 },
  h1: { fontSize: 24, fontWeight: "700", color: C.surco, marginBottom: 12 },
  muted: { color: C.muted, fontSize: 14 },
  screen: { flex: 1, backgroundColor: C.lino },
  pad: { padding: 16 },
});
