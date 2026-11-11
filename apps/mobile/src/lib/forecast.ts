/**
 * Pronóstico de 10 días en Hoy (C-02). No es una tabla sincronizable: se baja de GET /org/farms/:id/forecast
 * cuando hay señal y se guarda en kv con la hora de descarga, así se lee igual sin internet.
 */
export interface Kv {
  getKv(key: string): string | null;
  setKv(key: string, value: string | null): void;
}

export interface ForecastDay {
  date: string;
  tminC: number | null;
  tmaxC: number | null;
  precipMm: number | null;
}

export interface CachedForecast {
  farmId: string;
  /** Corrida del servidor (epoch ms). */
  runAt: number | null;
  /** Cuándo la bajó este celular (epoch ms). */
  fetchedAt: number;
  days: ForecastDay[];
}

interface Remote {
  runAt: number | null;
  days: ForecastDay[];
}

export const FORECAST_TTL_MS = 3 * 3_600_000; // el servidor la renueva cada 3 h
const key = (farmId: string) => `forecast:${farmId}`;

export function readForecast(kv: Kv, farmId: string): CachedForecast | null {
  try {
    const raw = kv.getKv(key(farmId));
    if (!raw) return null;
    const v = JSON.parse(raw) as CachedForecast;
    return Array.isArray(v.days) && typeof v.fetchedAt === "number" ? v : null;
  } catch {
    return null;
  }
}

export function saveForecast(kv: Kv, farmId: string, remote: Remote, now: number): CachedForecast {
  const value: CachedForecast = { farmId, runAt: remote.runAt, fetchedAt: now, days: remote.days.slice(0, 10) };
  kv.setKv(key(farmId), JSON.stringify(value));
  return value;
}

/** Baja el pronóstico si el guardado es viejo; sin señal (o con error) deja el que había. */
export async function refreshForecast(
  kv: Kv,
  farmId: string,
  fetchRemote: (farmId: string) => Promise<Remote>,
  now: number,
  force = false,
): Promise<CachedForecast | null> {
  const cached = readForecast(kv, farmId);
  if (!force && cached && now - cached.fetchedAt < FORECAST_TTL_MS) return cached;
  try {
    const remote = await fetchRemote(farmId);
    if (!remote.days.length) return cached;
    return saveForecast(kv, farmId, remote, now);
  } catch {
    return cached;
  }
}

/** Días desde `today` (el pronóstico guardado puede traer días que ya pasaron). */
export const upcoming = (f: CachedForecast, today: string): ForecastDay[] => f.days.filter((d) => d.date >= today);

export const daysOld = (fetchedAt: number, now: number): number => Math.floor((now - fetchedAt) / 86_400_000);
