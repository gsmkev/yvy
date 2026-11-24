/** Cifras, ficha y lista de las pantallas de oficina. */
import { type ReactNode } from "react";
import { FlatList, Pressable, View } from "react-native";
import { type LucideIcon } from "lucide-react-native";
import { EmptyState, Row, StatTile, Text } from "../../ui/kit";
import { C, F, T } from "../../ui/theme";

export interface StatItem {
  label: string;
  value: string | number;
  unit?: string;
  tone?: "danger";
  /** Si está, la cifra se toca y lleva a su pantalla. */
  onPress?: () => void;
}

/** Fila de cifras: 2 por fila, envuelve. La unidad va junto al rótulo ("Lluvia · mm"). */
export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
      {items.map((i) => {
        const label = i.unit ? `${i.label} · ${i.unit}` : i.label;
        const flex = { flexBasis: "47%", flexGrow: 1 } as const;
        return i.onPress ? (
          <Pressable key={i.label} accessibilityRole="button" onPress={i.onPress} style={({ pressed }) => [flex, { opacity: pressed ? 0.7 : 1 }]}>
            <StatTile value={i.value} label={label} tone={i.tone} />
          </Pressable>
        ) : (
          <StatTile key={i.label} value={i.value} label={label} tone={i.tone} style={flex} />
        );
      })}
    </View>
  );
}

/** Ficha clave–valor: el rótulo a la izquierda, el valor a la derecha. */
export function KeyValue({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View style={{ marginTop: 8 }}>
      {rows.map((r) => (
        <View key={r.label} accessible accessibilityLabel={`${r.label}: ${r.value}`} style={{ flexDirection: "row", gap: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.linea }}>
          <Text style={[T.small, { flex: 1 }]}>{r.label}</Text>
          <Text style={[T.bodyMedium, { flex: 1.4, textAlign: "right" }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}


const VIRTUALIZE_OVER = 30;

/**
 * La "tabla" del teléfono: una fila `Row` por elemento. Con más de 30 usa FlatList (sin scroll propio: la pantalla
 * ya se desplaza; renderiza por tandas). Con `rows` vacío muestra `empty`.
 */
export function DataList<R>({
  rows,
  keyOf,
  title,
  subtitle,
  right,
  icon,
  onPress,
  empty,
}: {
  rows: R[];
  keyOf: (r: R) => string;
  title: (r: R) => string;
  subtitle?: (r: R) => string | undefined;
  right?: (r: R) => string | ReactNode;
  icon?: LucideIcon;
  onPress?: (r: R) => void;
  empty: { title: string; hint?: string; action?: string; onAction?: () => void };
}) {
  if (rows.length === 0) return <EmptyState title={empty.title} hint={empty.hint} action={empty.action} onAction={empty.onAction} />;
  const render = (r: R) => {
    const rt = right?.(r);
    return (
      <Row
        title={title(r)}
        subtitle={subtitle?.(r)}
        icon={icon}
        onPress={onPress ? () => onPress(r) : undefined}
        right={typeof rt === "string" ? <Text style={{ fontFamily: F.sansMedium, fontSize: 17, color: C.tinta }}>{rt}</Text> : rt}
      />
    );
  };
  if (rows.length <= VIRTUALIZE_OVER) return <View style={{ marginTop: 8 }}>{rows.map((r) => <View key={keyOf(r)}>{render(r)}</View>)}</View>;
  return <FlatList data={rows} keyExtractor={keyOf} renderItem={({ item }) => render(item)} scrollEnabled={false} initialNumToRender={VIRTUALIZE_OVER} windowSize={7} style={{ marginTop: 8 }} />;
}
