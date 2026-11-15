/** Piezas de datos de las pantallas de oficina: cifras, ficha, lista, filtros, formulario y gráficos. */
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { ChevronDown, type LucideIcon } from "lucide-react-native";
import { CHART, t } from "@yvy/shared";
import { tap } from "../lib/haptics";
import { Button, ChoiceSheet, EmptyState, Row, Sheet, StatTile, Text, TextInput } from "../ui/kit";
import { C, F, RADIUS, T, TOUCH } from "../ui/theme";
import { barFractions, buildChart, segmentPath, type ChartSeries } from "./chartMath";
import { displayToIso, isoToDisplay, maskDate } from "./date";
import { fmtNumber } from "./format";

// ---------- Cifras y ficha ----------

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

// ---------- Lista ----------

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

// ---------- Filtros ----------

/** Chips de filtro en una fila desplazable. `count` opcional ("Pastura · 3"). */
export function FilterChips<V extends string>({ options, value, onChange }: { options: { value: V; label: string; count?: number }[]; value: V; onChange: (v: V) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        const label = o.count === undefined ? o.label : `${o.label} · ${o.count}`;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.accion : C.blanco, borderColor: on ? C.accion : C.lineaFuerte }}
          >
            <Text style={{ fontFamily: F.sansMedium, fontSize: 16, color: on ? C.blanco : C.tinta }}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Selector segmentado de 2 a 4 opciones, todas a la vista. */
export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, overflow: "hidden", backgroundColor: C.blanco }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={{ flex: 1, minHeight: 48, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.accion : "transparent", borderLeftWidth: i ? 1 : 0, borderLeftColor: C.lineaFuerte }}
          >
            <Text numberOfLines={1} style={{ fontFamily: F.sansMedium, fontSize: 16, color: on ? C.blanco : C.tinta }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Formulario ----------

/** Rótulo + control + ayuda o error. Los demás campos (TextField, SelectField, DateField) ya lo usan. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[T.smallMedium, { marginBottom: 6 }]}>{label}</Text>
      {children}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[T.small, { color: C.peligro, marginTop: 4 }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[T.small, { marginTop: 4 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const inputBox = (error?: string) =>
  ({
    minHeight: TOUCH,
    borderWidth: 1.5,
    borderColor: error ? C.peligro : C.lineaFuerte,
    borderRadius: RADIUS,
    backgroundColor: C.blanco,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  }) as const;

const inputText = { flex: 1, fontFamily: F.sans, fontSize: 17, color: C.tinta, paddingVertical: 12 } as const;

export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  kind = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
  error?: string;
  /** "number" = entero (teclado numérico); "decimal" = con coma o punto (usá parseDecimal de format.ts); "multiline" = varias líneas. */
  kind?: "text" | "number" | "decimal" | "multiline";
} & Pick<ComponentProps<typeof TextInput>, "placeholder" | "maxLength" | "autoCapitalize" | "secureTextEntry" | "editable">) {
  const keyboardType = kind === "number" ? "number-pad" : kind === "decimal" ? "decimal-pad" : "default";
  return (
    <Field label={label} hint={hint} error={error}>
      <View style={inputBox(error)}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          multiline={kind === "multiline"}
          placeholderTextColor={C.tinta3}
          style={[inputText, kind === "multiline" && { minHeight: 96, textAlignVertical: "top" }]}
          {...rest}
        />
      </View>
    </Field>
  );
}

/** Campo que abre una hoja (`ChoiceSheet`) con las opciones. */
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  hint,
  error,
}: {
  label: string;
  value: V | null | undefined;
  options: { value: V; label: string; hint?: string }[];
  onChange: (v: V) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Field label={label} hint={hint} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? t("office.selectPlaceholder")}`}
        onPress={() => {
          tap();
          setOpen(true);
        }}
        style={inputBox(error)}
      >
        <Text style={[inputText, !current && { color: C.tinta3 }]} numberOfLines={1}>
          {current?.label ?? placeholder ?? t("office.selectPlaceholder")}
        </Text>
        <ChevronDown size={22} color={C.tinta3} strokeWidth={2} />
      </Pressable>
      <ChoiceSheet
        visible={open}
        title={label}
        value={value ?? undefined}
        options={options}
        onClose={() => setOpen(false)}
        onSelect={(v) => {
          setOpen(false);
          onChange(v);
        }}
      />
    </Field>
  );
}

/**
 * Fecha como texto dd/mm/aaaa con máscara. `value` e `onChange` son ISO (aaaa-mm-dd); `onChange("")` mientras la
 * fecha está incompleta o no existe (31/02). Muestra "Fecha inválida" cuando están los 10 caracteres y no es una fecha.
 */
export function DateField({ label, value, onChange, hint, error }: { label: string; value: string; onChange: (iso: string) => void; hint?: string; error?: string }) {
  const [text, setText] = useState(isoToDisplay(value));
  // Si el valor cambia desde afuera (p. ej. al abrir un formulario con datos), se refleja; lo que se está tipeando no se pisa.
  useEffect(() => {
    if ((displayToIso(text) ?? "") !== value) setText(isoToDisplay(value));
  }, [value]);
  const invalid = text.length === 10 && displayToIso(text) === null;
  return (
    <Field label={label} hint={hint ?? t("office.datePlaceholder")} error={error ?? (invalid ? t("office.invalidDate") : undefined)}>
      <View style={inputBox(error ?? (invalid ? "x" : undefined))}>
        <TextInput
          accessibilityLabel={label}
          value={text}
          keyboardType="number-pad"
          maxLength={10}
          placeholder={t("office.datePlaceholder")}
          placeholderTextColor={C.tinta3}
          style={inputText}
          onChangeText={(raw) => {
            const masked = maskDate(raw);
            setText(masked);
            onChange(displayToIso(masked) ?? "");
          }}
        />
      </View>
    </Field>
  );
}

/** Formulario en una hoja inferior (sube con el teclado). El botón principal dice `submitLabel`; `error` va arriba del botón. */
export function FormSheet({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  pending,
  error,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose} avoidKeyboard>
      {children}
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[T.bodyMedium, { color: C.peligro, marginTop: 16 }]}>
          {error}
        </Text>
      ) : null}
      <Button title={submitLabel} onPress={onSubmit} loading={pending} style={{ marginTop: 20 }} />
      <Button kind="text" title={t("ui.cancel")} onPress={onClose} disabled={pending} style={{ marginTop: 4 }} />
    </Sheet>
  );
}

// ---------- Gráficos ----------

/** Barras horizontales: rótulo arriba, barra y valor a la derecha. Hechas con Views (texto y accesibilidad nativos). */
export function BarList({ rows, unit }: { rows: { label: string; value: number }[]; unit?: string }) {
  const fr = barFractions(rows.map((r) => r.value));
  return (
    <View style={{ marginTop: 8 }}>
      {rows.map((r, i) => {
        const val = `${fmtNumber(r.value)}${unit ? ` ${unit}` : ""}`;
        return (
          <View key={r.label} accessible accessibilityLabel={`${r.label}: ${val}`} style={{ paddingVertical: 8 }}>
            <Text style={T.small} numberOfLines={1}>
              {r.label}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
              <View style={{ flex: 1, height: 16, borderRadius: 8, backgroundColor: C.linea, overflow: "hidden" }}>
                <View style={{ width: `${Math.round((fr[i] ?? 0) * 100)}%`, height: 16, borderRadius: 8, backgroundColor: CHART.primary }} />
              </View>
              <Text style={[T.bodyMedium, { minWidth: 72, textAlign: "right" }]}>{val}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export interface LineChartProps {
  series: ChartSeries[];
  height?: number;
  /** Unidad del eje Y y del resumen accesible, p. ej. "mm". */
  yUnit?: string;
}

/**
 * Gráfico de líneas con ejes mínimos (3 líneas guía, primera y última x), leyenda y resumen accesible.
 * `x`: números (escala lineal) o textos ya formateados ("12/11"); `y: null` deja un hueco en la línea.
 * Colores: pasá `CHART.primary`, `CHART.comparison`, `CHART.warm`, `CHART.gauge` de @yvy/shared.
 */
export function LineChart({ series, height = 200, yUnit }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const m = buildChart(series);
  const unit = yUnit ? ` ${yUnit}` : "";
  const summary = series
    .map((s) => {
      const ys = s.points.map((p) => p.y).filter((y): y is number => y !== null);
      if (!ys.length) return t("office.chartSummaryNoData", { label: s.label });
      return t("office.chartSummary", { label: s.label, n: ys.length, min: fmtNumber(Math.min(...ys)), max: fmtNumber(Math.max(...ys)), last: fmtNumber(ys[ys.length - 1]!), unit });
    })
    .join(". ");
  if (m.empty) return <EmptyState title={t("office.chartEmpty")} />;
  const padL = 44;
  const padR = 12;
  const padT = 8;
  const padB = 24;
  const w = Math.max(0, width - padL - padR);
  const h = height - padT - padB;
  const ticks = [0, 0.5, 1];
  const first = m.xs[0];
  const last = m.xs[m.xs.length - 1];
  return (
    <View style={{ marginTop: 8 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={summary} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {ticks.map((tk) => {
              const y = padT + (1 - tk) * h;
              const v = m.yMin + tk * (m.yMax - m.yMin);
              return (
                <G key={tk}>
                  <Line x1={padL} x2={padL + w} y1={y} y2={y} stroke={CHART.grid} strokeWidth={1} />
                  <SvgText x={padL - 6} y={y + 4} fontSize={12} fill={CHART.axis} textAnchor="end" fontFamily={F.sans}>
                    {fmtNumber(v)}
                  </SvgText>
                </G>
              );
            })}
            {first && (
              <SvgText x={padL + first.pos * w} y={height - 6} fontSize={12} fill={CHART.axis} textAnchor={first.pos > 0.4 ? "middle" : "start"} fontFamily={F.sans}>
                {first.label}
              </SvgText>
            )}
            {last && last !== first && (
              <SvgText x={padL + last.pos * w} y={height - 6} fontSize={12} fill={CHART.axis} textAnchor="end" fontFamily={F.sans}>
                {last.label}
              </SvgText>
            )}
            {m.lines.map((l) =>
              l.segments.map((seg, i) =>
                seg.length === 1 ? (
                  <Circle key={`${l.label}${i}`} cx={padL + seg[0]!.x * w} cy={padT + (1 - seg[0]!.y) * h} r={3.5} fill={l.color} />
                ) : (
                  <Path key={`${l.label}${i}`} d={segmentPath(seg, padL, padT, w, h)} stroke={l.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                ),
              ),
            )}
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 8 }}>
        {series.map((s) => (
          <View key={s.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: s.color }} />
            <Text style={T.small}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
