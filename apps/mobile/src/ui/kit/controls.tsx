/** Texto, campo, botón y fila: lo básico de toda pantalla. */
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, Text as RNText, TextInput as RNTextInput, View, type StyleProp, type TextProps, type ViewStyle } from "react-native";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { C, MAX_FONT_SCALE, T } from "../theme";
import { s } from "./styles";

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
  icon: Icon,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "text" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
  /** Ícono a la izquierda del texto. */
  icon?: LucideIcon;
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
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.4 : pressed ? 0.9 : 1 },
        pressed && !disabled && !loading && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={s.btnInner}>
          {Icon ? <Icon size={22} color={palette.fg} strokeWidth={2} /> : null}
          <Text style={[s.btnText, big && s.btnTextBig, { color: palette.fg }]}>{title}</Text>
        </View>
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
  icon: Icon,
  tone,
  chevron,
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
  /** Ícono en un cuadrado a la izquierda. */
  icon?: LucideIcon;
  tone?: "danger";
  /** Flecha a la derecha. Por defecto aparece cuando la fila navega (tiene `onPress` y no tiene `right` ni `choice`). */
  chevron?: boolean;
}) {
  const danger = tone === "danger";
  const showChevron = chevron ?? (!!onPress && !right && !choice);
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
      {Icon ? (
        <View style={[s.rowIcon, danger && { backgroundColor: C.peligroSuave }]}>
          <Icon size={22} color={danger ? C.peligro : C.accionOscuro} strokeWidth={2} />
        </View>
      ) : null}
      {left && <View style={s.rowLeft}>{left}</View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[T.bodyMedium, selected && { color: C.accionOscuro }, danger && { color: C.peligro }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={T.small} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right && <View style={s.rowRight}>{right}</View>}
      {showChevron ? <ChevronRight size={20} color={C.tinta3} strokeWidth={2} /> : null}
    </Pressable>
  );
}

type SyncState = "pending" | "synced" | "rejected";

/** Borde izquierdo de una fila con su estado de envío (paleta: pendiente punteado trigo, enviado sólido soja). */
function StatusEdge({ status }: { status: SyncState }) {
  const color = status === "pending" ? C.trigo : status === "rejected" ? C.peligro : C.soja;
  return (
    <View style={s.edge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {status === "pending" ? Array.from({ length: 16 }, (_, i) => <View key={i} style={[s.dash, { backgroundColor: color }]} />) : <View style={{ flex: 1, backgroundColor: color }} />}
    </View>
  );
}
