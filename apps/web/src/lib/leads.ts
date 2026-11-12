/** Informe gratis a cambio del email (V-04): lectura de las coordenadas que escribe la persona. */
import { LIMITS } from "@yvy/shared";

export interface Point {
  lat: number;
  lon: number;
}

const NUM = String.raw`-?\d{1,3}(?:[.,]\d+)?`;
const PAIR = new RegExp(`^\\s*(${NUM})\\s*[;,\\s]\\s*(${NUM})\\s*$`);

/** "-27,3 -55,9", "-27.3, -55.9" o "-27.3;-55.9" → { lat, lon }; null si no se entiende o no son grados válidos. */
export function parseCoords(text: string): Point | null {
  const m = PAIR.exec(text);
  if (!m) return null;
  const lat = Number(m[1]!.replace(",", "."));
  const lon = Number(m[2]!.replace(",", "."));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export function inParaguay(p: Point): boolean {
  const b = LIMITS.leads.bbox;
  return p.lon >= b.minLon && p.lon <= b.maxLon && p.lat >= b.minLat && p.lat <= b.maxLat;
}
