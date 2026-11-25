/** Gráficos: barras y líneas. */
import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { CHART, t } from "@yvy/shared";
import { EmptyState, Text } from "../../ui/kit";
import { C, F, T } from "../../ui/theme";
import { barFractions, buildChart, segmentPath, type ChartSeries } from "../chartMath";
import { fmtNumber } from "../format";


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

interface LineChartProps {
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
      if (!ys.length) return t("office.chart.summaryNoData", { label: s.label });
      return t("office.chart.summary", { label: s.label, n: ys.length, min: fmtNumber(Math.min(...ys)), max: fmtNumber(Math.max(...ys)), last: fmtNumber(ys[ys.length - 1]!), unit });
    })
    .join(". ");
  if (m.empty) return <EmptyState title={t("office.chart.empty")} />;
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
            {series.length > 1 ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: s.color }} /> : null}
            <Text style={T.small}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
