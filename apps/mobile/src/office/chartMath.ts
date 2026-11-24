/** Matemática pura de los gráficos (sin React). */

/** Techo "redondo" para el eje: 1, 2, 5 × 10^k. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  const f = max / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

/** Ancho relativo (0–1) de cada barra; el mayor ocupa todo. Valores negativos o nulos dan 0. */
export function barFractions(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 && v > 0 ? v / max : 0));
}

interface ChartPoint {
  x: number | string;
  y: number | null;
}
export interface ChartSeries {
  label: string;
  color: string;
  points: ChartPoint[];
}

interface ChartModel {
  /** Posición (0–1) de cada x del dominio común y su texto. */
  xs: { pos: number; label: string }[];
  yMin: number;
  yMax: number;
  /** Por serie: trazos separados donde hay huecos (y null), en coordenadas normalizadas (x 0–1, y 0–1 con 0 abajo). */
  lines: { color: string; label: string; segments: { x: number; y: number }[][] }[];
  empty: boolean;
}

/** Arma el modelo: dominio X común (numérico si todas las x lo son; si no, por orden de aparición) y eje Y desde 0. */
export function buildChart(series: ChartSeries[]): ChartModel {
  const all = series.flatMap((s) => s.points);
  const allNumeric = all.length > 0 && all.every((p) => typeof p.x === "number");
  let key: (x: number | string) => number;
  let xs: { pos: number; label: string }[];
  if (allNumeric) {
    const nums = all.map((p) => p.x as number);
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    const span = hi - lo || 1;
    key = (x) => ((x as number) - lo) / span;
    xs = [...new Set(nums)].sort((a, b) => a - b).map((n) => ({ pos: hi === lo ? 0.5 : (n - lo) / span, label: String(n) }));
  } else {
    const order: string[] = [];
    for (const p of all) {
      const k = String(p.x);
      if (!order.includes(k)) order.push(k);
    }
    const last = Math.max(1, order.length - 1);
    key = (x) => (order.length === 1 ? 0.5 : order.indexOf(String(x)) / last);
    xs = order.map((label, i) => ({ pos: order.length === 1 ? 0.5 : i / last, label }));
  }
  const ys = all.map((p) => p.y).filter((y): y is number => y !== null && Number.isFinite(y));
  const empty = ys.length === 0;
  const yMin = Math.min(0, ...ys);
  const yMax = niceMax(Math.max(0, ...ys));
  const span = yMax - yMin || 1;
  const lines = series.map((s) => {
    const segments: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    for (const p of s.points) {
      if (p.y === null || !Number.isFinite(p.y)) {
        if (cur.length) segments.push(cur);
        cur = [];
      } else cur.push({ x: key(p.x), y: (p.y - yMin) / span });
    }
    if (cur.length) segments.push(cur);
    return { color: s.color, label: s.label, segments };
  });
  return { xs, yMin, yMax, lines, empty };
}

/** Path SVG de un trazo, dentro de un rectángulo (x0, y0 arriba-izquierda; w, h). */
export function segmentPath(seg: { x: number; y: number }[], x0: number, y0: number, w: number, h: number): string {
  return seg.map((p, i) => `${i ? "L" : "M"}${(x0 + p.x * w).toFixed(1)} ${(y0 + (1 - p.y) * h).toFixed(1)}`).join(" ");
}
