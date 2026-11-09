import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { CloudOff, RefreshCw, CheckCircle2, type LucideIcon } from "lucide-react-native";
import { SYNC_BORDER, t } from "@yvy/shared";
import { syncNow, useSyncStatus } from "../lib/sync";
import { C, MONO, TOUCH } from "./theme";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  icon: Icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === "primary" ? C.accion : C.papel;
  const fg = variant === "primary" ? C.white : variant === "danger" ? C.peligro : C.surco;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: variant === "primary" ? C.accion : C.linea,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {Icon && <Icon size={20} color={fg} strokeWidth={2} />}
      <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

/** Indicador siempre visible (RF-43): SIN SEÑAL · N PENDIENTES / SINCRONIZANDO… / SINCRONIZADO · HH:MM */
export function SyncBar() {
  const s = useSyncStatus();
  const time = s.lastSyncAt
    ? new Date(s.lastSyncAt).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";
  const offline = !s.online || s.pending > 0;
  const label =
    s.phase === "syncing"
      ? t("sync.syncing")
      : !s.online
        ? s.pending === 0
          ? t("sync.offlineNone")
          : s.pending === 1
            ? t("sync.offlineOne")
            : t("sync.offline", { count: s.pending })
        : s.pending > 0
          ? s.pending === 1
            ? t("sync.pendingOne")
            : t("sync.pending", { count: s.pending })
          : t("sync.synced", { time });
  const color = s.phase === "syncing" ? C.cielo : offline ? C.trigo : C.soja;
  const Icon = offline ? CloudOff : CheckCircle2;
  return (
    <Pressable
      onPress={syncNow}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${t("sync.syncNow")}`}
      style={styles.bar}
    >
      {s.phase === "syncing" ? (
        <ActivityIndicator color={C.cielo} size="small" />
      ) : (
        <Icon size={18} color={color} strokeWidth={2.25} />
      )}
      <Text style={[styles.barText, { color }]} numberOfLines={1}>
        {label}
      </Text>
      <RefreshCw size={18} color={C.lino} strokeWidth={2} />
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

export const Eyebrow = ({ children }: { children: ReactNode }) => <Text style={styles.eyebrow}>{children}</Text>;
export const H1 = ({ children }: { children: ReactNode }) => <Text style={styles.h1}>{children}</Text>;
export const Muted = ({ children }: { children: ReactNode }) => <Text style={styles.muted}>{children}</Text>;

export function Header({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <H1>{title}</H1>
    </View>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <View style={styles.empty}>
      <Icon size={28} color={C.tinta2} strokeWidth={1.75} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {text && <Muted>{text}</Muted>}
    </View>
  );
}

export const styles = StyleSheet.create({
  btn: {
    minHeight: TOUCH,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  btnText: { fontSize: 17, fontWeight: "600" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    minHeight: 48,
    backgroundColor: C.surco,
  },
  barText: { ...MONO, fontWeight: "700", letterSpacing: 0.5, fontSize: 13, flex: 1 },
  card: { backgroundColor: C.white, borderWidth: 2, borderRadius: 10, padding: 14, marginBottom: 10 },
  eyebrow: { ...MONO, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.tinta2, marginBottom: 2 },
  h1: { fontSize: 28, fontWeight: "700", color: C.surco, letterSpacing: -0.5 },
  muted: { color: C.tinta2, fontSize: 14 },
  screen: { flex: 1, backgroundColor: C.lino },
  pad: { padding: 16, paddingBottom: 32 },
  empty: {
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.linea,
    borderRadius: 10,
    padding: 18,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: C.surco },
});
