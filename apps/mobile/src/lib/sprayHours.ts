/**
 * Pronóstico por hora de MET Norway (A-12): se baja de GET /org/farms/:id/spray-windows junto con el de 10 días y
 * se guarda en kv, así al registrar una aplicación sin señal se precargan viento, temperatura y humedad de esa hora.
 */
import { forecastHourAt, LIMITS } from "@yvy/shared";
import type { Kv } from "./forecast";

export interface SprayHour {
  at: number;
  tempC: number | null;
  windKmh: number | null;
  humidityPct: number | null;
}

interface Cached {
  fetchedAt: number;
  hours: SprayHour[];
}

const key = (farmId: string) => `sprayhours:${farmId}`;

export function readSprayHours(kv: Kv, farmId: string): Cached | null {
  try {
    const raw = kv.getKv(key(farmId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Cached;
    return Array.isArray(v.hours) && typeof v.fetchedAt === "number" ? v : null;
  } catch {
    return null;
  }
}

/** Baja las horas si lo guardado tiene más de la caché del pronóstico; sin señal deja lo que había. */
export async function refreshSprayHours(
  kv: Kv,
  farmId: string,
  fetchRemote: (farmId: string) => Promise<{ hours: SprayHour[] }>,
  now: number,
): Promise<void> {
  const cached = readSprayHours(kv, farmId);
  if (cached && now - cached.fetchedAt < LIMITS.weather.forecastCacheMs) return;
  try {
    const { hours } = await fetchRemote(farmId);
    if (!hours.length) return;
    const slim = hours.map((h) => ({ at: h.at, tempC: h.tempC, windKmh: h.windKmh, humidityPct: h.humidityPct }));
    kv.setKv(key(farmId), JSON.stringify({ fetchedAt: now, hours: slim } satisfies Cached));
  } catch {
    /* sin señal: queda lo guardado */
  }
}

/** Condiciones de esta hora en la caché; null si no hay pronóstico guardado que llegue a `now`. */
export function sprayPrefill(kv: Kv, farmId: string | undefined, now: number): { windKmh?: number; tempC?: number; humidityPct?: number } | null {
  if (!farmId) return null;
  const c = readSprayHours(kv, farmId);
  const h = c ? forecastHourAt(c.hours, now) : null;
  if (!h) return null;
  const out: { windKmh?: number; tempC?: number; humidityPct?: number } = {};
  if (h.windKmh !== null) out.windKmh = Math.round(h.windKmh);
  if (h.tempC !== null) out.tempC = Math.round(h.tempC * 10) / 10;
  if (h.humidityPct !== null) out.humidityPct = Math.round(h.humidityPct);
  return Object.keys(out).length ? out : null;
}
