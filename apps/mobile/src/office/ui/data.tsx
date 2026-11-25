/** Cifras, ficha y lista de las pantallas de oficina. */
import { useState, type ReactNode } from "react";
import { FlatList, Pressable, View } from "react-native";
import { type LucideIcon } from "lucide-react-native";
import { EmptyState, Row, Sheet, Text } from "../../ui/kit";
import { C, F, RADIUS, T } from "../../ui/theme";

/** Cifra destacada con su etiqueta y unidad. */
export interface StatItem {
  label: string;
  value: string | number;
  unit?: string;
  tone?: "danger";
  /** Si está, la cifra se toca y lleva a su pantalla. */
  onPress?: () => void;
}

/**
 * Resumen de cifras en una sola tarjeta. Con 2 o 3 cifras van en una fila, separadas por una línea fina; con 4 o más
 * se reparten en 2 columnas. Cada cifra es rótulo chico arriba del valor ("Lluvia · mm" cuando lleva unidad) y se
 * encoge antes que partirse. `columns` fuerza el reparto (con 1 es una lista rótulo–valor, para montos largos); una última cifra suelta en 2 columnas ocupa todo el ancho. Una cifra con `onPress` es tocable; con `tone: "danger"` va en rojo (y su rótulo la nombra,
 * no solo el color).
 */
export function StatSummary({ items, columns }: { items: StatItem[]; columns?: 1 | 2 | 3 }) {
  const cols = columns ?? (items.length <= 3 ? Math.max(items.length, 1) : 2);
  if (cols === 1) {
    return (
      <View style={{ marginTop: 16, borderRadius: RADIUS, borderWidth: 1, borderColor: C.linea, backgroundColor: C.blanco, overflow: "hidden" }}>
        {items.map((i, n) => {
          const label = i.unit ? `${i.label} (${i.unit})` : i.label;
          const danger = i.tone === "danger";
          return (
            <View key={i.label} accessible accessibilityLabel={`${i.value} ${label}`} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: n ? 1 : 0, borderColor: C.linea, backgroundColor: danger ? C.peligroSuave : undefined }}>
              <Text style={[T.small, danger && { color: C.peligro }]}>{label}</Text>
              <Text style={{ fontFamily: F.serif, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: danger ? C.peligro : C.tinta, flexShrink: 1 }}>{i.value}</Text>
            </View>
          );
        })}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 16, borderRadius: RADIUS, borderWidth: 1, borderColor: C.linea, backgroundColor: C.blanco, overflow: "hidden" }}>
      {items.map((i, n) => {
        const label = i.unit ? `${i.label} (${i.unit})` : i.label;
        const danger = i.tone === "danger";
        const cell = (
          <>
            <Text style={[T.small, { fontSize: 13, lineHeight: 17 }, danger && { color: C.peligro }]} numberOfLines={2}>
              {label}
            </Text>
            <Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6} style={{ fontFamily: F.serif, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: danger ? C.peligro : C.tinta, marginTop: 2 }}>
              {i.value}
            </Text>
          </>
        );
        const box = {
          width: cols === 2 && n === items.length - 1 && items.length % 2 === 1 ? "100%" : `${100 / cols}%`,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderLeftWidth: n % cols ? 1 : 0,
          borderTopWidth: n >= cols ? 1 : 0,
          borderColor: C.linea,
          backgroundColor: danger ? C.peligroSuave : undefined,
        } as const;
        return i.onPress ? (
          <Pressable key={i.label} accessibilityRole="button" accessibilityLabel={`${i.value} ${label}`} onPress={i.onPress} style={({ pressed }) => [box, { opacity: pressed ? 0.7 : 1 }]}>
            {cell}
          </Pressable>
        ) : (
          <View key={i.label} accessible accessibilityLabel={`${i.value} ${label}`} style={box}>
            {cell}
          </View>
        );
      })}
    </View>
  );
}

/** Nombre histórico de `StatSummary`: las pantallas lo siguen usando con la misma API. */
export const StatRow = StatSummary;

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
 * ya se desplaza; renderiza por tandas). Con `rows` vacío muestra `empty`. La fila lleva una sola línea secundaria;
 * con `detail`, tocarla abre una hoja con la ficha completa (si no hay `onPress`).
 */
export function DataList<R>({
  rows,
  keyOf,
  title,
  subtitle,
  right,
  icon,
  onPress,
  detail,
  empty,
}: {
  rows: R[];
  keyOf: (r: R) => string;
  title: (r: R) => string;
  subtitle?: (r: R) => string | undefined;
  right?: (r: R) => string | ReactNode;
  icon?: LucideIcon;
  onPress?: (r: R) => void;
  /** Ficha completa de la fila (rótulo–valor) que se abre al tocarla; el título de la hoja es el de la fila. */
  detail?: (r: R) => { label: string; value: string }[];
  empty: { title: string; hint?: string; action?: string; onAction?: () => void };
}) {
  const [open, setOpen] = useState<R | null>(null);
  if (rows.length === 0) return <EmptyState title={empty.title} hint={empty.hint} action={empty.action} onAction={empty.onAction} />;
  const render = (r: R) => {
    const rt = right?.(r);
    return (
      <Row
        title={title(r)}
        subtitle={subtitle?.(r)}
        icon={icon}
        onPress={onPress ? () => onPress(r) : detail ? () => setOpen(r) : undefined}
        right={typeof rt === "string" ? <Text style={{ fontFamily: F.sansMedium, fontSize: 17, color: C.tinta }}>{rt}</Text> : rt}
      />
    );
  };
  const list =
    rows.length <= VIRTUALIZE_OVER ? (
      <View style={{ marginTop: 8 }}>{rows.map((r) => <View key={keyOf(r)}>{render(r)}</View>)}</View>
    ) : (
      <FlatList data={rows} keyExtractor={keyOf} renderItem={({ item }) => render(item)} scrollEnabled={false} initialNumToRender={VIRTUALIZE_OVER} windowSize={7} style={{ marginTop: 8 }} />
    );
  return (
    <>
      {list}
      {open && detail ? (
        <Sheet visible title={title(open)} onClose={() => setOpen(null)}>
          <KeyValue rows={detail(open)} />
        </Sheet>
      ) : null}
    </>
  );
}
