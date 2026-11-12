/**
 * Dibujo sobre la foto (F-08): flecha y círculo. Las marcas se guardan normalizadas (0 a 1 sobre la foto)
 * para que el dibujo no dependa del tamaño de pantalla; al guardar se aplanan en la imagen. Funciones puras.
 */

export interface Pt {
  x: number;
  y: number;
}

export type Mark = { kind: "arrow"; from: Pt; to: Pt } | { kind: "circle"; center: Pt; edge: Pt };

/** Ajusta una imagen a una caja manteniendo la proporción (como resizeMode "contain"). */
export function fitContain(imgW: number, imgH: number, boxW: number, boxH: number): { width: number; height: number } {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) return { width: 0, height: 0 };
  const k = Math.min(boxW / imgW, boxH / imgH);
  return { width: Math.round(imgW * k), height: Math.round(imgH * k) };
}

/** Tamaño de la imagen aplanada: el lado largo queda en `longSide` (nunca agranda más que la foto original). */
export function flattenSize(imgW: number, imgH: number, longSide: number): { width: number; height: number } {
  const k = Math.min(1, longSide / Math.max(imgW, imgH));
  return { width: Math.round(imgW * k), height: Math.round(imgH * k) };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Punto del toque en la caja de la foto, normalizado y recortado a la foto. */
export const normalize = (x: number, y: number, w: number, h: number): Pt => ({ x: clamp01(w ? x / w : 0), y: clamp01(h ? y / h : 0) });

/** Un gesto muy corto es un toque sin querer, no una marca. `minFraction` es sobre el lado menor de la foto. */
export function isMeaningful(a: Pt, b: Pt, w: number, h: number, minFraction = 0.04): boolean {
  return Math.hypot((b.x - a.x) * w, (b.y - a.y) * h) >= minFraction * Math.min(w, h);
}

/** Radio del círculo en píxeles de la caja (centro -> borde arrastrado). */
export const circleRadius = (center: Pt, edge: Pt, w: number, h: number): number => Math.hypot((edge.x - center.x) * w, (edge.y - center.y) * h);

/**
 * Puntas de la cabeza de la flecha en píxeles: dos puntos que, unidos a `to`, forman la "V".
 * `head` es el largo de la punta; ángulo de 28 grados a cada lado.
 */
export function arrowHead(from: Pt, to: Pt, w: number, h: number, head = 28): [Pt, Pt] {
  const fx = from.x * w;
  const fy = from.y * h;
  const tx = to.x * w;
  const ty = to.y * h;
  const ang = Math.atan2(ty - fy, tx - fx);
  const spread = (28 * Math.PI) / 180;
  const len = Math.min(head, Math.hypot(tx - fx, ty - fy) * 0.6);
  return [
    { x: tx - len * Math.cos(ang - spread), y: ty - len * Math.sin(ang - spread) },
    { x: tx - len * Math.cos(ang + spread), y: ty - len * Math.sin(ang + spread) },
  ];
}

/** Quita la última marca (deshacer). */
export const undo = (marks: Mark[]): Mark[] => marks.slice(0, -1);
