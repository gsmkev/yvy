/** Piezas compartidas de los gráficos SVG: marco, marcas de los ejes, leyenda y seguimiento del puntero. */
import { useRef, useState } from "react";
import { CHART } from "@yvy/shared";

/** Serie de un gráfico: nombre, color y si se dibuja con trazo discontinuo. */
export interface Series {
  name: string;
  color: string;
  dashed?: boolean;
  points: { x: number; y: number | null }[];
}

/** Dimensiones del lienzo SVG y sus márgenes interiores. */
export interface Frame {
  width: number;
  height: number;
  pad: { l: number; r: number; t: number; b: number };
}

/** Marco por defecto de los gráficos. */
export const FRAME: Frame = { width: 640, height: 220, pad: { l: 40, r: 12, t: 12, b: 26 } };

/** Marcas "redondas" para un eje entre `min` y `max`, unas `n` en total. */
export function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) return [min];
  const step0 = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/** Leyenda de las series; no se dibuja si hay menos de dos. */
export function Legend({ series }: { series: { name: string; color: string; dashed?: boolean; dot?: boolean }[] }) {
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

/**
 * Índice del punto más cercano al puntero sobre el SVG.
 * @param xs posiciones x de los puntos, en las unidades del eje.
 * @returns el índice activo (`i`) y su setter, el ref del SVG y `onMove`, que recibe el evento y la proyección de x a píxeles.
 */
export function useHover(xs: number[]) {
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

/** Líneas de la grilla horizontal con el valor de cada marca a la izquierda. */
export function YGrid({
  ticks,
  sy,
  width,
  fontSize = "11",
  strokeWidth,
  format = (t) => t,
}: {
  ticks: number[];
  sy: (v: number) => number;
  width: number;
  fontSize?: string;
  strokeWidth?: string;
  format?: (t: number) => string | number;
}) {
  const { pad } = FRAME;
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke={CHART.grid} strokeWidth={strokeWidth} />
          <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={fontSize} fill={CHART.axis}>
            {format(t)}
          </text>
        </g>
      ))}
    </>
  );
}
