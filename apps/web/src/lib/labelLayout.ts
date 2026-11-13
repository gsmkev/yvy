/**
 * Etiquetas de lotes sin choques con los íconos del mapa. Trabaja en píxeles de pantalla:
 * cada etiqueta (centrada en su lote) prueba el centro y luego arriba, abajo, izquierda y derecha de los
 * íconos; si no entra en ningún lado, se oculta (en zoom bajo no hay lugar para todos los nombres).
 */
export interface LabelBox {
  /** Centro del lote en pantalla. */
  x: number;
  y: number;
  /** Tamaño del texto. */
  w: number;
  h: number;
}
export interface Obstacle {
  x: number;
  y: number;
  /** Radio del ícono. */
  r: number;
}
export interface Placement {
  dx: number;
  dy: number;
  hidden: boolean;
}

const PAD = 3;

function hitsCircle(cx: number, cy: number, w: number, h: number, o: Obstacle): boolean {
  // Punto del rectángulo más cercano al centro del círculo
  const nx = Math.max(cx - w / 2, Math.min(o.x, cx + w / 2));
  const ny = Math.max(cy - h / 2, Math.min(o.y, cy + h / 2));
  return Math.hypot(nx - o.x, ny - o.y) < o.r + PAD;
}
function hitsRect(a: { cx: number; cy: number; w: number; h: number }, b: { cx: number; cy: number; w: number; h: number }): boolean {
  return Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + PAD && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2 + PAD;
}

export function placeLabels(labels: LabelBox[], obstacles: Obstacle[]): Placement[] {
  const placed: { cx: number; cy: number; w: number; h: number }[] = [];
  const rmax = obstacles.reduce((m, o) => Math.max(m, o.r), 0);
  return labels.map((l) => {
    const up = -(l.h / 2 + rmax + PAD);
    const down = l.h / 2 + rmax + PAD;
    const side = l.w / 2 + rmax + PAD;
    const candidates: [number, number][] = [
      [0, 0],
      [0, up],
      [0, down],
      [-side, 0],
      [side, 0],
    ];
    for (const [dx, dy] of candidates) {
      const box = { cx: l.x + dx, cy: l.y + dy, w: l.w, h: l.h };
      if (obstacles.some((o) => hitsCircle(box.cx, box.cy, l.w, l.h, o))) continue;
      if (placed.some((p) => hitsRect(box, p))) continue;
      placed.push(box);
      return { dx, dy, hidden: false };
    }
    return { dx: 0, dy: 0, hidden: true };
  });
}
