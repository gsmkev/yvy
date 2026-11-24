import { useState } from "react";
import { CHART } from "@yvy/shared";
import { FRAME, YGrid, niceTicks } from "./common";

/** Columnas de una sola serie con etiquetas por categoría (heladas por año, focos por mes). */
export function ColumnChart(props: {
  items: { label: string; value: number }[];
  unit: string;
  color?: string;
  ariaLabel: string;
  /** Muestra solo cada `every` etiquetas del eje (para series largas). */
  every?: number;
}) {
  const { width, height, pad } = FRAME;
  const max = Math.max(1, ...props.items.map((i) => i.value));
  const n = props.items.length || 1;
  const slot = (width - pad.l - pad.r) / n;
  const bw = Math.max(3, Math.min(26, slot - 3));
  const sy = (v: number) => height - pad.b - (v / max) * (height - pad.t - pad.b);
  const cx = (i: number) => pad.l + i * slot + slot / 2;
  const ticks = niceTicks(0, max);
  const every = props.every ?? 1;
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? props.items[hover] : null;
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={props.ariaLabel}>
        <YGrid ticks={ticks} sy={sy} width={width} />
        {props.items.map((it, i) => (
          <g key={it.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <rect x={cx(i) - slot / 2} y={pad.t} width={slot} height={height - pad.t - pad.b} fill="transparent" />
            {it.value > 0 && (
              <rect
                x={cx(i) - bw / 2}
                y={sy(it.value)}
                width={bw}
                height={Math.max(0, sy(0) - sy(it.value))}
                rx={Math.min(3, bw / 4)}
                fill={props.color ?? CHART.comparison}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            )}
            {i % every === 0 && (
              <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={CHART.axis}>
                {it.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-lg bg-surco px-2.5 py-1.5 text-xs text-lino">
          <span className="font-semibold">{h.label}</span>: {h.value} {props.unit}
        </div>
      )}
    </figure>
  );
}
