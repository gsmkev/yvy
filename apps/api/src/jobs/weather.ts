/**
 * Clima del Worker (PRD-cloudflare §4.7):
 * - Pronóstico MET Norway Locationforecast 2.0 "complete" (9-10 días, mínimas de 6 h). Licencia CC BY 4.0;
 *   atribución "Datos de MET Norway". User-Agent propio y coordenadas a 4 decimales, como piden sus términos.
 * - NASA POWER diario: temperatura y humedad del suelo (GWETTOP/GWETROOT, fracción de saturación 0-1).
 */
import { LIMITS, localDate } from "@yvy/shared";

export interface DailyForecast {
  date: string;
  tminC: number | null;
  tmaxC: number | null;
  precipMm: number;
  windKmh: number | null;
  windDirDeg: number | null;
}

interface MetStep {
  time: string;
  data: {
    instant: {
      details: {
        air_temperature?: number;
        wind_speed?: number;
        wind_from_direction?: number;
        relative_humidity?: number;
      };
    };
    next_1_hours?: { details?: { precipitation_amount?: number } };
    next_6_hours?: {
      details?: { precipitation_amount?: number; air_temperature_min?: number; air_temperature_max?: number };
    };
  };
}

export interface MetResponse {
  properties: { meta: { updated_at: string }; timeseries: MetStep[] };
}

const round = (n: number, d = LIMITS.weather.coordDecimals) => Number(n.toFixed(d));

export const metUrl = (lat: number, lon: number) =>
  `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${round(lat)}&lon=${round(lon)}`;

export async function fetchMet(
  fetchFn: typeof fetch,
  userAgent: string,
  lat: number,
  lon: number,
): Promise<MetResponse> {
  const res = await fetchFn(metUrl(lat, lon), { headers: { "User-Agent": userAgent, Accept: "application/json" } });
  if (!res.ok) throw new Error(`MET Norway ${res.status}`);
  return (await res.json()) as MetResponse;
}

export interface HourlyForecast {
  validAt: number;
  tempC: number;
  windKmh: number;
  humidityPct: number;
  precipMm: number;
}

/**
 * Horas sueltas del pronóstico (viento, temperatura, humedad y lluvia de la hora) desde `fromMs`, hasta
 * `hours` horas. Solo pasos con datos de 1 hora; MET los trae así las primeras ~60 horas.
 */
export function hourlyFromMet(met: MetResponse, fromMs: number, hours: number): HourlyForecast[] {
  const out: HourlyForecast[] = [];
  const start = fromMs - (fromMs % 3_600_000);
  for (const st of met.properties.timeseries) {
    const t = Date.parse(st.time);
    if (t < start || t >= start + hours * 3_600_000) continue;
    const i = st.data.instant.details;
    const rain = st.data.next_1_hours?.details?.precipitation_amount;
    if (
      i.air_temperature === undefined ||
      i.wind_speed === undefined ||
      i.relative_humidity === undefined ||
      rain === undefined
    )
      continue;
    out.push({
      validAt: t,
      tempC: i.air_temperature,
      windKmh: Math.round(i.wind_speed * 36) / 10,
      humidityPct: i.relative_humidity,
      precipMm: rain,
    });
  }
  return out;
}

/** Agrega la serie de MET a días locales sin contar dos veces la lluvia. */
export function dailyFromMet(met: MetResponse, tz: string): DailyForecast[] {
  const days = new Map<string, DailyForecast & { windMs: number }>();
  const day = (ms: number) => {
    const key = localDate(ms, tz);
    let d = days.get(key);
    if (!d)
      days.set(
        key,
        (d = { date: key, tminC: null, tmaxC: null, precipMm: 0, windKmh: null, windDirDeg: null, windMs: -1 }),
      );
    return d;
  };
  const steps = met.properties.timeseries;
  let coveredUntil = 0;
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i]!;
    const t = Date.parse(st.time);
    const next = steps[i + 1] ? Date.parse(steps[i + 1]!.time) : Infinity;
    const inst = st.data.instant.details;
    const d = day(t);
    if (inst.air_temperature !== undefined) {
      d.tminC = Math.min(d.tminC ?? Infinity, inst.air_temperature);
      d.tmaxC = Math.max(d.tmaxC ?? -Infinity, inst.air_temperature);
    }
    if (inst.wind_speed !== undefined && inst.wind_speed > d.windMs) {
      d.windMs = inst.wind_speed;
      d.windDirDeg = inst.wind_from_direction ?? null;
    }
    const six = st.data.next_6_hours?.details;
    if (six) {
      // mínimas/máximas de 6 h: se asignan al día local del centro de la ventana
      const mid = day(t + 3 * 3_600_000);
      if (six.air_temperature_min !== undefined) mid.tminC = Math.min(mid.tminC ?? Infinity, six.air_temperature_min);
      if (six.air_temperature_max !== undefined) mid.tmaxC = Math.max(mid.tmaxC ?? -Infinity, six.air_temperature_max);
    }
    if (t < coveredUntil) continue;
    const hourly = st.data.next_1_hours?.details?.precipitation_amount;
    if (hourly !== undefined && next - t <= 3_600_000) {
      d.precipMm += hourly;
      coveredUntil = t + 3_600_000;
    } else if (six?.precipitation_amount !== undefined) {
      d.precipMm += six.precipitation_amount;
      coveredUntil = t + 6 * 3_600_000;
    }
  }
  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ windMs, ...d }) => ({
      ...d,
      precipMm: Math.round(d.precipMm * 10) / 10,
      windKmh: windMs >= 0 ? Math.round(windMs * 36) / 10 : null,
    }));
}

// ---------- NASA POWER ----------

export interface PowerDaily {
  date: string;
  tminC: number | null;
  tmaxC: number | null;
  precipMm: number | null;
  soilTop: number | null;
  soilRoot: number | null;
}

export const powerUrl = (lat: number, lon: number, start: string, end: string) =>
  `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MIN,T2M_MAX,GWETTOP,GWETROOT,PRECTOTCORR&community=AG&longitude=${round(lon)}&latitude=${round(lat)}&start=${start.replaceAll("-", "")}&end=${end.replaceAll("-", "")}&format=JSON`;

export function dailyFromPower(json: {
  properties: { parameter: Record<string, Record<string, number>> };
}): PowerDaily[] {
  const p = json.properties.parameter;
  const v = (k: string, date: string) => {
    const x = p[k]?.[date];
    return x === undefined || x <= -999 ? null : x;
  };
  return Object.keys(p.T2M_MIN ?? {})
    .map((k) => {
      const date = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
      return {
        date,
        tminC: v("T2M_MIN", k),
        tmaxC: v("T2M_MAX", k),
        precipMm: v("PRECTOTCORR", k),
        soilTop: v("GWETTOP", k),
        soilRoot: v("GWETROOT", k),
      };
    })
    .filter((d) => d.tminC !== null || d.soilTop !== null);
}
