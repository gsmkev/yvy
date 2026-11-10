import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { CloudOff } from "lucide-react-native";
import { t } from "@yvy/shared";
import { syncNow, useSyncStatus } from "../lib/sync";
import { C, F, GUTTER, RADIUS, T, TOUCH } from "./theme";

/** Botón: `primary` solo uno por pantalla. `secondary` para alternativas. `text` para salir sin hacer nada. */
export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  loading,
  style,
  big,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "text" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const palette = {
    primary: { bg: C.accion, fg: C.blanco, border: C.accion },
    secondary: { bg: C.blanco, fg: C.tinta, border: C.lineaFuerte },
    text: { bg: "transparent", fg: C.tinta2, border: "transparent" },
    danger: { bg: C.blanco, fg: C.peligro, border: C.peligro },
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        big && s.btnBig,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[s.btnText, big && s.btnTextBig, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Fila grande tocable (lote, tarea, opción). Una línea principal y una secundaria. */
export function Row({
  title,
  subtitle,
  onPress,
  left,
  right,
  selected,
  disabled,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [s.row, selected && s.rowSelected, pressed && s.rowPressed, disabled && { opacity: 0.5 }]}
    >
      {left && <View style={s.rowLeft}>{left}</View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[T.bodyMedium, selected && { color: C.accionOscuro }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={T.small} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right && <View style={s.rowRight}>{right}</View>}
    </Pressable>
  );
}

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

export const Title = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <Text style={[T.title, style as never]}>{children}</Text>
);

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.papel },
  pad: { paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: 40 },
  btn: {
    minHeight: TOUCH,
    borderRadius: RADIUS,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  btnBig: { minHeight: 64 },
  btnText: { fontFamily: F.sansSemi, fontSize: 18 },
  btnTextBig: { fontSize: 20 },
  row: {
    minHeight: TOUCH + 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.linea,
  },
  rowSelected: { backgroundColor: C.accionSuave, marginHorizontal: -GUTTER, paddingHorizontal: GUTTER, borderBottomColor: "transparent", borderRadius: RADIUS },
  rowPressed: { opacity: 0.7 },
  rowLeft: { width: 32, alignItems: "center" },
  rowRight: { alignItems: "flex-end" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8, paddingHorizontal: GUTTER },
  divider: { height: 1, backgroundColor: C.linea, marginVertical: 16 },
});
