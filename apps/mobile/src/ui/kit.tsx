import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput as RNTextInput,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { CloudOff } from "lucide-react-native";
import { t } from "@yvy/shared";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { syncNow, useSyncStatus } from "../lib/sync";
import { useToast } from "../lib/toast";
import { C, F, GUTTER, MAX_FONT_SCALE, RADIUS, T, TOUCH } from "./theme";

/** Texto que respeta el tamaño de letra del sistema hasta 1,3 veces, para que el diseño no se rompa (U-21). */
export function Text(props: TextProps) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

export function TextInput(props: ComponentProps<typeof RNTextInput>) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

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
  choice,
  status,
}: {
  title: string;
  subtitle?: string;
  /** Estado de envío de lo que muestra la fila: pendiente = borde punteado trigo, enviado = sólido soja, rechazado = sólido alerta. */
  status?: SyncState;
  onPress?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  /** U-26: la fila es una opción. "radio" (una sola, dentro de un RadioGroup) o "checkbox" (se tildan varias): TalkBack la anuncia con su estado. */
  choice?: "radio" | "checkbox";
}) {
  return (
    <Pressable
      accessibilityRole={choice ?? (onPress ? "button" : undefined)}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={choice ? { checked: !!selected, disabled: !!disabled } : { selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [s.row, selected && s.rowSelected, pressed && s.rowPressed, disabled && { opacity: 0.5 }]}
    >
      {status && <StatusEdge status={status} />}
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

export type SyncState = "pending" | "synced" | "rejected";

/** Borde izquierdo de una fila con su estado de envío (paleta: pendiente punteado trigo, enviado sólido soja). */
export function StatusEdge({ status }: { status: SyncState }) {
  const color = status === "pending" ? C.trigo : status === "rejected" ? C.peligro : C.soja;
  return (
    <View style={s.edge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {status === "pending" ? Array.from({ length: 16 }, (_, i) => <View key={i} style={[s.dash, { backgroundColor: color }]} />) : <View style={{ flex: 1, backgroundColor: color }} />}
    </View>
  );
}

/** Encabezado de sección: texto de 15 px en tinta secundaria, con `action` opcional a la derecha (un texto tocable). */
export function SectionHeader({ title, action, onAction, first }: { title: string; action?: string; onAction?: () => void; first?: boolean }) {
  return (
    <View style={[s.section, first && { marginTop: 4 }]}>
      <Text accessibilityRole="header" style={s.sectionText}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} hitSlop={8} style={s.sectionAction}>
          <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Estado vacío: qué pasa y, si hay una salida, el botón para hacerla. */
export function EmptyState({ title, hint, action, onAction }: { title: string; hint?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.empty}>
      <Text style={T.heading}>{title}</Text>
      {hint ? <Text style={[T.small, { marginTop: 4 }]}>{hint}</Text> : null}
      {action && onAction ? <Button kind="secondary" title={action} onPress={onAction} style={{ marginTop: 16, alignSelf: "flex-start" }} /> : null}
    </View>
  );
}

/** Fila con interruptor (ajustes). */
export function SwitchRow({ title, hint, value, onValueChange }: { title: string; hint?: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={s.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={T.body}>{title}</Text>
        {hint ? <Text style={T.small}>{hint}</Text> : null}
      </View>
      <Switch value={value} accessibilityLabel={title} onValueChange={onValueChange} trackColor={{ true: C.accion }} />
    </View>
  );
}

/** Cuerpo de un paso: el contenido se desplaza y la acción principal queda fija abajo, siempre a la vista (también con el teclado abierto o con textos largos). */
export function ScreenBody({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>{footer}</View>
    </View>
  );
}

/** U-26: agrupa opciones de una sola respuesta para que TalkBack diga "opción 2 de 4" y el nombre del grupo. */
export function RadioGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {children}
    </View>
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
  edge: { width: 3, alignSelf: "stretch", overflow: "hidden", gap: 4, borderRadius: 2, marginRight: -4 },
  dash: { height: 6 },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 4, minHeight: 24 },
  sectionText: { fontFamily: F.sansSemi, fontSize: 15, color: C.tinta2 },
  sectionAction: { minHeight: 48, justifyContent: "center", marginVertical: -12 },
  empty: { paddingVertical: 32 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: TOUCH + 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.linea },
  rowLeft: { width: 32, alignItems: "center" },
  rowRight: { alignItems: "flex-end" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8, paddingHorizontal: GUTTER },
  toast: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.tinta, paddingHorizontal: GUTTER, paddingTop: 14 },
  footer: { paddingHorizontal: GUTTER, paddingTop: 12, backgroundColor: C.papel, borderTopWidth: 1, borderTopColor: C.linea, gap: 8 },
  divider: { height: 1, backgroundColor: C.linea, marginVertical: 16 },
});
