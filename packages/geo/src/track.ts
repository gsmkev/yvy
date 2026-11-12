/** Recorridas GPS (F-05): simplificación Douglas-Peucker y largo, en metros sobre la esfera local. Sin dependencias. */

export type LonLat = [number, number];

const M_PER_DEG_LAT = 111_320;

/** Proyección plana local (equirrectangular) alrededor de la latitud media: sobra para tramos de un campo. */
function project(points: readonly LonLat[]): [number, number][] {
  const lat0 = points.reduce((a, p) => a + p[1], 0) / points.length;
  const kx = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return points.map((p) => [p[0] * kx, p[1] * M_PER_DEG_LAT]);
}

/** Distancia de p al segmento a-b. */
function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas-Peucker iterativo (sin recursión: una recorrida larga no debe desbordar la pila).
 * `toleranceM`: cuánto puede separarse la línea simplificada de la original. Conserva siempre el primer y el último punto.
 */
export function simplifyLine(points: readonly LonLat[], toleranceM: number): LonLat[] {
  if (points.length <= 2 || toleranceM <= 0) return points.map((p) => [p[0], p[1]]);
  const xy = project(points);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(xy[i]!, xy[first]!, xy[last]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = true;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => [p[0], p[1]]);
}

/** Largo de la línea en metros (haversine entre puntos consecutivos). */
export function trackLengthM(points: readonly LonLat[]): number {
  const R = 6_371_008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dLat = rad(b[1] - a[1]);
    const dLon = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}

/**
 * Simplifica hasta que entre en `maxPoints`: sube la tolerancia (x1,6) hasta lograrlo.
 * Si aun así no entra, deja los puntos a intervalos parejos (el largo se calcula antes, con la línea cruda).
 */
export function simplifyToMax(points: readonly LonLat[], maxPoints: number, startToleranceM = 3): LonLat[] {
  let tol = startToleranceM;
  let out = simplifyLine(points, tol);
  for (let i = 0; i < 20 && out.length > maxPoints; i++) {
    tol *= 1.6;
    out = simplifyLine(points, tol);
  }
  if (out.length <= maxPoints) return out;
  const step = (out.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => out[Math.round(i * step)]!);
}
