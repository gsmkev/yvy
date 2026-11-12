/** Rumbo y distancia a un destino, sin red (F-03 "Llevame ahí"). Funciones puras. */
const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distancia en metros por círculo máximo (haversine). */
export function distanceM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de `from` a `to` en grados, 0 = norte, sentido horario, [0, 360). */
export function bearingDeg(from: { lon: number; lat: number }, to: { lon: number; lat: number }): number {
  const dLon = rad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(rad(to.lat));
  const x = Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) - Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(dLon);
  return ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360;
}

/** Cuánto hay que girar, en (-180, 180]: positivo = a la derecha. */
export function turnDeg(bearing: number, heading: number): number {
  const d = (((bearing - heading) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

const POINTS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;
export const cardinal = (deg: number): (typeof POINTS)[number] => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

/** "42 m", "350 m" o "1,2 km". */
export function formatDistance(m: number): string {
  if (m < 1000) {
    const step = m < 100 ? 1 : 10;
    return `${Math.round(m / step) * step} m`;
  }
  return `${(m / 1000).toLocaleString("es-PY", { maximumFractionDigits: 1 })} km`;
}
