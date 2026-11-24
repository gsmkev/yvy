/** Encabezados, estados vacíos, interruptores y cifras. */
import { Pressable, Switch, View, type StyleProp, type ViewStyle } from "react-native";
import { tap } from "../../lib/haptics";
import { C, T } from "../theme";
import { Text, Button } from "./controls";
import { s } from "./styles";

/** Encabezado de sección: texto de 15 px en tinta secundaria, con `action` opcional a la derecha (un texto tocable). */
export function SectionHeader({ title, action, onAction, first }: { title: string; action?: string; onAction?: () => void; first?: boolean }) {
  return (
    <View style={[s.section, first && { marginTop: 20 }]}>
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
export function SwitchRow({ title, hint, value, onValueChange, disabled }: { title: string; hint?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={s.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={T.body}>{title}</Text>
        {hint ? <Text style={T.small}>{hint}</Text> : null}
      </View>
      {/* nosemgrep: react-props-spreading -- `activeThumbColor` no está en los tipos de Switch pero lo lee react-native-web */}
      <Switch value={value} disabled={disabled} accessibilityLabel={title} onValueChange={(v) => (tap(), onValueChange(v))} trackColor={{ false: C.lineaFuerte, true: C.accion }} thumbColor={C.blanco} {...({ activeThumbColor: C.blanco } as object)} />
    </View>
  );
}

/** Cifra grande con su rótulo, para resúmenes. */
export function StatTile({ value, label, style, tone }: { value: string | number; label: string; style?: StyleProp<ViewStyle>; tone?: "danger" }) {
  return (
    <View accessible accessibilityLabel={`${value} ${label}`} style={[s.stat, tone === "danger" && { borderColor: C.peligro, backgroundColor: C.peligroSuave }, style]}>
      <Text style={[s.statValue, tone === "danger" && { color: C.peligro }]}>{value}</Text>
      <Text style={T.small} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
