import { CHART } from "@yvy/shared";
import { FRAME, Legend, YGrid, niceTicks, useHover } from "./common";

/** Barras diarias (lluvia) con referencia opcional (normal) y puntos (pluviómetro). */
export function RainChart(props: {
  days: { date: string; mm: number | null; normal?: number | null; gauge?: number | null }[];
  labels: { satellite: string; normal: string; gauge: string };
  formatDate: (d: string) => string;
  ariaLabel: string;
}) {
  const { width, height, pad } = FRAME;
  const xs = props.days.map((_, i) => i);
  const hover = useHover(xs);
  const max = Math.max(5, ...props.days.flatMap((d) => [d.mm ?? 0, d.normal ?? 0, d.gauge ?? 0]));
  const n = props.days.length || 1;
  const bw = (width - pad.l - pad.r) / n;
  const sx = (i: number) => pad.l + i * bw + bw / 2;
  const sy = (v: number) => height - pad.b - (v / max) * (height - pad.t - pad.b);
  const ticks = niceTicks(0, max);
  const hasNormal = props.days.some((d) => d.normal != null);
  const hasGauge = props.days.some((d) => d.gauge != null);
  const normalPath = props.days
    .map((d, i) =>
      d.normal != null ? `${i && props.days[i - 1]?.normal != null ? "L" : "M"}${sx(i)},${sy(d.normal)}` : "",
    )
    .join("");
  const h = hover.i !== null ? props.days[hover.i] : null;

  return (
    <figure className="relative">
      <Legend
        series={[
          { name: props.labels.satellite, color: CHART.comparison },
          ...(hasNormal ? [{ name: props.labels.normal, color: CHART.axis, dashed: true }] : []),
          ...(hasGauge ? [{ name: props.labels.gauge, color: CHART.gauge, dot: true }] : []),
        ]}
      />
      <svg
        ref={hover.svg}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none"
        role="img"
        aria-label={props.ariaLabel}
        onPointerMove={(e) => hover.onMove(e, sx)}
        onPointerLeave={() => hover.setI(null)}
      >
        <YGrid ticks={ticks} sy={sy} width={width} />
        {props.days.map((d, i) =>
          d.mm ? (
            <rect
              key={d.date}
              x={sx(i) - Math.max(1, bw / 2 - 1)}
              y={sy(d.mm)}
              width={Math.max(2, bw - 2)}
              height={Math.max(0, sy(0) - sy(d.mm))}
              rx={Math.min(4, bw / 4)}
              fill={CHART.comparison}
              opacity={hover.i === null || hover.i === i ? 1 : 0.55}
            />
          ) : null,
        )}
        {hasNormal && <path d={normalPath} fill="none" stroke={CHART.axis} strokeWidth="1.5" strokeDasharray="4 3" />}
        {props.days.map((d, i) =>
          d.gauge != null ? (
            <circle
              key={`g${d.date}`}
              cx={sx(i)}
              cy={sy(d.gauge)}
              r="4"
              fill={CHART.gauge}
              stroke="#fff"
              strokeWidth="2"
            />
          ) : null,
        )}
        {[0, Math.floor((n - 1) / 2), n - 1]
          .filter((v, k, a) => a.indexOf(v) === k && props.days[v])
          .map((i) => (
            <text key={i} x={sx(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={CHART.axis}>
              {props.formatDate(props.days[i]!.date)}
            </text>
          ))}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-6 rounded-lg bg-surco px-2.5 py-1.5 text-xs text-lino shadow-lg"
          style={{
            left: `${(sx(hover.i!) / width) * 100}%`,
            transform: `translateX(${sx(hover.i!) > width / 2 ? "-105%" : "5%"})`,
          }}
        >
          <div className="font-semibold">{props.formatDate(h.date)}</div>
          <div>
            {props.labels.satellite}: {h.mm == null ? "—" : `${h.mm.toFixed(1)} mm`}
          </div>
          {h.normal != null && (
            <div>
              {props.labels.normal}: {h.normal.toFixed(1)} mm
            </div>
          )}
          {h.gauge != null && (
            <div>
              {props.labels.gauge}: {h.gauge.toFixed(1)} mm
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
