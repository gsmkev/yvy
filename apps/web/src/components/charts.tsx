/**
 * Gráficos SVG livianos: un solo eje Y, líneas de 2 px, leyenda con ≥ 2 series, tooltip al pasar el mouse.
 * El texto usa tinta de texto, nunca el color de la serie.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CHART } from "@yvy/shared";
import { getUnits, mmToRain, rainLabel } from "../lib/units";

export interface Series {
  name: string;
  color: string;
  dashed?: boolean;
  points: { x: number; y: number | null }[];
}

interface Frame {
  width: number;
  height: number;
  pad: { l: number; r: number; t: number; b: number };
}

const FRAME: Frame = { width: 640, height: 220, pad: { l: 40, r: 12, t: 12, b: 26 } };

function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) return [min];
  const step0 = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

function Legend({ series }: { series: { name: string; color: string; dashed?: boolean; dot?: boolean }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-4 text-xs text-tinta-2">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5">
          {s.dot ? (
            <svg width="10" height="10">
              <circle cx="5" cy="5" r="4" fill={s.color} />
            </svg>
          ) : (
            <svg width="18" height="6">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray={s.dashed ? "4 3" : undefined}
              />
            </svg>
          )}
          {s.name}
        </span>
      ))}
    </div>
  );
}

function useHover(xs: number[]) {
  const [i, setI] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const onMove = (e: React.PointerEvent, toPx: (x: number) => number) => {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * FRAME.width;
    let best = 0;
    xs.forEach((x, k) => {
      if (Math.abs(toPx(x) - px) < Math.abs(toPx(xs[best]!) - px)) best = k;
    });
    setI(xs.length ? best : null);
  };
  return { i, setI, svg, onMove };
}

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
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke={CHART.grid} strokeWidth="1" />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="11" fill={CHART.axis}>
              {props.formatY(t)}
            </text>
          </g>
        ))}
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
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke={CHART.grid} />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="11" fill={CHART.axis}>
              {t}
            </text>
          </g>
        ))}
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

const rainMm = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const rainIn = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** Lluvia para el tooltip: un decimal en mm, dos en pulgadas. */
const rainMm1 = (v: number, inches: boolean) =>
  new Intl.NumberFormat("es-PY", { minimumFractionDigits: inches ? 2 : 1, maximumFractionDigits: inches ? 2 : 1 }).format(v);

/** Barras por mes: pluviómetro y satélite lado a lado, con la normal como marca (C-05, C-06). */
export function MonthlyRainChart(props: {
  months: { label: string; gauge: number | null; sat: number | null; normal: number | null }[];
  labels: { satellite: string; normal: string; gauge: string };
  ariaLabel: string;
}) {
  const { height, pad } = FRAME;
  // La lluvia llega en mm; se dibuja y se rotula en la unidad elegida en Preferencias
  const inches = getUnits().rain === "in";
  const unit = rainLabel();
  const conv = (v: number | null) => (v === null ? null : mmToRain(v));
  const fmtV = (v: number) => (inches ? rainIn.format(v) : rainMm.format(v));
  const months = props.months.map((m) => ({ ...m, gauge: conv(m.gauge), sat: conv(m.sat), normal: conv(m.normal) }));
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
  const max = Math.max(inches ? 0.4 : 10, ...months.flatMap((m) => [m.gauge ?? 0, m.sat ?? 0, m.normal ?? 0]));
  const n = months.length || 1;
  const slot = (width - pad.l - pad.r) / n;
  const bw = Math.min(28, slot / 3);
  const sy = (v: number) => height - pad.b - (v / max) * (height - pad.t - pad.b);
  const cx = (i: number) => pad.l + i * slot + slot / 2;
  const ticks = niceTicks(0, max);
  const hasNormal = months.some((m) => m.normal !== null);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? months[hover] : null;
  return (
    <figure ref={box} className="relative">
      <Legend
        series={[
          ...(months.some((m) => m.gauge !== null)
            ? [{ name: props.labels.gauge, color: CHART.gauge, dot: true }]
            : []),
          ...(months.some((m) => m.sat !== null)
            ? [{ name: props.labels.satellite, color: CHART.comparison, dot: true }]
            : []),
          ...(hasNormal ? [{ name: props.labels.normal, color: CHART.axis, dashed: true }] : []),
        ]}
      />
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={props.ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke={CHART.grid} />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="12" fill={CHART.axis}>
              {fmtV(t)}
            </text>
          </g>
        ))}
        <text x={pad.l - 6} y={pad.t - 2} textAnchor="end" fontSize="12" fill={CHART.axis}>
          {unit}
        </text>
        {months.map((m, i) => (
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
                {fmtV(inches ? m.gauge : Math.round(m.gauge))}
              </text>
            )}
            {m.sat !== null && m.sat > 0 && (
              <text x={cx(i) + bw / 2 + 1} y={sy(m.sat) - 4} textAnchor="middle" fontSize="12" fill={CHART.axis}>
                {fmtV(inches ? m.sat : Math.round(m.sat))}
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
          {months.some((m) => m.gauge !== null) && (
            <div>
              {props.labels.gauge}: {h.gauge === null ? "—" : `${rainMm1(h.gauge, inches)} ${unit}`}
            </div>
          )}
          {months.some((m) => m.sat !== null) && (
            <div>
              {props.labels.satellite}: {h.sat === null ? "—" : `${rainMm1(h.sat, inches)} ${unit}`}
            </div>
          )}
          {h.normal !== null && (
            <div>
              {props.labels.normal}: {rainMm1(h.normal, inches)} {unit}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

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
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke={CHART.grid} />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="11" fill={CHART.axis}>
              {t}
            </text>
          </g>
        ))}
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
