import { useLayoutEffect, useRef, useState } from "react";
import { CHART } from "@yvy/shared";
import { t } from "../../lib/i18n";
import { FRAME, Legend, YGrid, niceTicks } from "./common";

/** Barras por mes: pluviómetro y satélite lado a lado, con la normal como marca. */
export function MonthlyRainChart(props: {
  months: { label: string; gauge: number | null; sat: number | null; normal: number | null }[];
  labels: { satellite: string; normal: string; gauge: string };
  ariaLabel: string;
}) {
  const { height, pad } = FRAME;
  // El lienzo mide lo mismo que la pantalla: en el celular el texto no se achica con el gráfico
  const box = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(FRAME.width);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const max = Math.max(10, ...props.months.flatMap((m) => [m.gauge ?? 0, m.sat ?? 0, m.normal ?? 0]));
  const n = props.months.length || 1;
  const slot = (width - pad.l - pad.r) / n;
  const bw = Math.min(28, slot / 3);
  const sy = (v: number) => height - pad.b - (v / max) * (height - pad.t - pad.b);
  const cx = (i: number) => pad.l + i * slot + slot / 2;
  const ticks = niceTicks(0, max);
  const hasNormal = props.months.some((m) => m.normal !== null);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? props.months[hover] : null;
  return (
    <figure ref={box} className="relative">
      <Legend
        series={[
          ...(props.months.some((m) => m.gauge !== null)
            ? [{ name: props.labels.gauge, color: CHART.gauge, dot: true }]
            : []),
          ...(props.months.some((m) => m.sat !== null)
            ? [{ name: props.labels.satellite, color: CHART.comparison, dot: true }]
            : []),
          ...(hasNormal ? [{ name: props.labels.normal, color: CHART.axis, dashed: true }] : []),
        ]}
      />
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={props.ariaLabel}>
        <YGrid ticks={ticks} sy={sy} width={width} fontSize="12" />
        <text x={pad.l - 6} y={pad.t - 2} textAnchor="end" fontSize="12" fill={CHART.axis}>
          {t("ui.units.mm")}
        </text>
        {props.months.map((m, i) => (
          <g
            key={m.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            opacity={hover === null || hover === i ? 1 : 0.55}
          >
            <rect x={cx(i) - slot / 2} y={pad.t} width={slot} height={height - pad.t - pad.b} fill="transparent" />
            {m.gauge !== null && (
              <rect
                x={cx(i) - bw - 1}
                y={sy(m.gauge)}
                width={bw}
                height={Math.max(0, sy(0) - sy(m.gauge))}
                rx={3}
                fill={CHART.gauge}
              />
            )}
            {m.sat !== null && (
              <rect
                x={cx(i) + 1}
                y={sy(m.sat)}
                width={bw}
                height={Math.max(0, sy(0) - sy(m.sat))}
                rx={3}
                fill={CHART.comparison}
              />
            )}
            {m.normal !== null && (
              <line
                x1={cx(i) - bw - 4}
                x2={cx(i) + bw + 4}
                y1={sy(m.normal)}
                y2={sy(m.normal)}
                stroke={CHART.axis}
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            )}
            {m.gauge !== null && m.gauge > 0 && (
              <text x={cx(i) - bw / 2 - 1} y={sy(m.gauge) - 4} textAnchor="middle" fontSize="12" fill={CHART.axis}>
                {Math.round(m.gauge)}
              </text>
            )}
            {m.sat !== null && m.sat > 0 && (
              <text x={cx(i) + bw / 2 + 1} y={sy(m.sat) - 4} textAnchor="middle" fontSize="12" fill={CHART.axis}>
                {Math.round(m.sat)}
              </text>
            )}
            <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize="12" fill={CHART.axis}>
              {m.label}
            </text>
          </g>
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-6 right-2 rounded-lg bg-surco px-2.5 py-1.5 text-xs text-lino">
          <div className="font-semibold">{h.label}</div>
          {props.months.some((m) => m.gauge !== null) && (
            <div>
              {props.labels.gauge}: {h.gauge === null ? "—" : `${h.gauge.toFixed(1)} mm`}
            </div>
          )}
          {props.months.some((m) => m.sat !== null) && (
            <div>
              {props.labels.satellite}: {h.sat === null ? "—" : `${h.sat.toFixed(1)} mm`}
            </div>
          )}
          {h.normal !== null && (
            <div>
              {props.labels.normal}: {h.normal.toFixed(1)} mm
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
