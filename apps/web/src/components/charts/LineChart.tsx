/** Gráfico de líneas sobre un eje temporal. */
import { useMemo } from "react";
import { CHART } from "@yvy/shared";
import { FRAME, Legend, YGrid, niceTicks, useHover, type Series } from "./common";

/** Líneas sobre un eje temporal (x en epoch ms). */
export function LineChart(props: {
  series: Series[];
  yLabel: string;
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  yDomain?: [number, number];
  ariaLabel: string;
}) {
  const { width, height, pad } = FRAME;
  const all = props.series.flatMap((s) => s.points.filter((p) => p.y !== null)) as { x: number; y: number }[];
  const xs = useMemo(() => [...new Set(all.map((p) => p.x))].sort((a, b) => a - b), [props.series]);
  const hover = useHover(xs);
  if (!all.length) return null;
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const ys = all.map((p) => p.y);
  const [y0, y1] = props.yDomain ?? [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => pad.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (width - pad.l - pad.r);
  const sy = (y: number) => height - pad.b - ((y - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);
  const ticks = niceTicks(y0, y1);
  const xTicks = xs.length <= 6 ? xs : [0, 0.25, 0.5, 0.75, 1].map((f) => xs[Math.round(f * (xs.length - 1))]!);
  const hx = hover.i !== null ? xs[hover.i] : null;

  return (
    <figure className="relative">
      <Legend series={props.series} />
      <svg
        ref={hover.svg}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none"
        role="img"
        aria-label={props.ariaLabel}
        onPointerMove={(e) => hover.onMove(e, sx)}
        onPointerLeave={() => hover.setI(null)}
      >
        <YGrid ticks={ticks} sy={sy} width={width} strokeWidth="1" format={(t) => props.formatY(t)} />
        {xTicks.map((x) => (
          <text key={x} x={sx(x)} y={height - 8} textAnchor="middle" fontSize="11" fill={CHART.axis}>
            {props.formatX(x)}
          </text>
        ))}
        {props.series.map((s) => {
          const pts = s.points.filter((p) => p.y !== null) as { x: number; y: number }[];
          const d = pts.map((p, k) => `${k ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
          return (
            <g key={s.name}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? "5 4" : undefined}
              />
              {pts.length <= 40 &&
                pts.map((p) => (
                  <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="3" fill={s.color} stroke="#fff" strokeWidth="1.5" />
                ))}
            </g>
          );
        })}
        {hx !== null && hx !== undefined && (
          <line
            x1={sx(hx)}
            x2={sx(hx)}
            y1={pad.t}
            y2={height - pad.b}
            stroke={CHART.axis}
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        )}
      </svg>
      {hx !== null && hx !== undefined && (
        <div
          className="pointer-events-none absolute top-6 rounded-lg bg-surco px-2.5 py-1.5 text-xs text-lino shadow-lg"
          style={{
            left: `${(sx(hx) / width) * 100}%`,
            transform: `translateX(${sx(hx) > width / 2 ? "-105%" : "5%"})`,
          }}
        >
          <div className="font-semibold">{props.formatX(hx)}</div>
          {props.series.map((s) => {
            const p = s.points.find((q) => q.x === hx);
            return p && p.y !== null ? (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}: {props.formatY(p.y)}
              </div>
            ) : null;
          })}
        </div>
      )}
      <figcaption className="sr-only">{props.yLabel}</figcaption>
    </figure>
  );
}
