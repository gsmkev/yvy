/**
 * Balance hídrico simple por lote (C-08, A-43): lluvia (CHIRPS) más riego aplicado menos el consumo del cultivo (ETc).
 * La evapotranspiración de referencia (ET0) sale de la temperatura mínima y máxima de NASA POWER con Hargreaves-Samani
 * (FAO-56) y se multiplica por el coeficiente del cultivo (Kc) según los días desde la siembra.
 * Es un balance de entradas y salidas, sin suelo ni escorrentía: sirve para ver la tendencia de estrés, no para regar.
 */
import { LIMITS } from "./limits";
import type { CROPS } from "./schema";

type Crop = (typeof CROPS)[number];

/** Kc inicial, medio y final y duración (días) de las cuatro fases FAO-56: inicial, desarrollo, media y final. */
export const CROP_KC: Partial<
  Record<Crop, { ini: number; mid: number; end: number; len: [number, number, number, number] }>
> = {
  soja: { ini: 0.4, mid: 1.15, end: 0.5, len: [20, 30, 50, 20] },
  maiz: { ini: 0.3, mid: 1.2, end: 0.35, len: [20, 35, 40, 30] },
  trigo: { ini: 0.3, mid: 1.15, end: 0.25, len: [20, 50, 60, 30] },
  arroz: { ini: 1.05, mid: 1.2, end: 0.9, len: [30, 30, 60, 30] },
  girasol: { ini: 0.35, mid: 1.0, end: 0.35, len: [25, 35, 45, 25] },
};

/** Coeficiente del cultivo a los `d` días de la siembra (0 = el día de siembra); null sin referencia o antes de sembrar. */
export function cropKc(crop: Crop, d: number): number | null {
  const c = CROP_KC[crop];
  if (!c || d < 0) return null;
  const [l1, l2, l3, l4] = c.len;
  if (d < l1) return c.ini;
  if (d < l1 + l2) return c.ini + ((d - l1) / l2) * (c.mid - c.ini);
  if (d < l1 + l2 + l3) return c.mid;
  if (d < l1 + l2 + l3 + l4) return c.mid + ((d - l1 - l2 - l3) / l4) * (c.end - c.mid);
  return c.end;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Radiación extraterrestre diaria en mm equivalentes de agua (FAO-56, ecuaciones 21 a 25). */
export function extraterrestrialMm(latDeg: number, dayOfYear: number): number {
  const phi = rad(latDeg);
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  const ws = Math.acos(Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta))));
  const ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
  return ra * 0.408;
}

/** ET0 diaria (mm) por Hargreaves-Samani. */
export function et0Hargreaves(tminC: number, tmaxC: number, latDeg: number, dayOfYear: number): number {
  const range = Math.max(0, tmaxC - tminC);
  return Math.max(0, 0.0023 * ((tmaxC + tminC) / 2 + 17.8) * Math.sqrt(range) * extraterrestrialMm(latDeg, dayOfYear));
}

export const dayOfYearIso = (iso: string): number => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 0)) / 86_400_000);
};

export interface BalanceDay {
  date: string;
  rainMm: number | null;
  tminC: number | null;
  tmaxC: number | null;
}

export type StressRisk = "low" | "medium" | "high";

export interface WaterBalanceResult {
  /** Días con lluvia (los únicos que entran al balance); con `keepWithoutEt`, también los que no tienen temperatura. */
  days: number;
  rainMm: number;
  /** Riego aplicado en esos días (A-43). */
  irrigationMm: number;
  etcMm: number;
  /** Días del balance sin temperatura: no restan consumo, así que el balance de esos días es solo lluvia más riego. */
  etMissingDays: number;
  balanceMm: number;
  /** Balance de los últimos 14 días completos. */
  balance14Mm: number | null;
  /** Sin riesgo cuando algún día reciente no tiene consumo estimado: el número sería optimista. */
  risk: StressRisk | null;
  series: { date: string; rainMm: number; irrigationMm: number; etcMm: number | null; cumMm: number }[];
}

export interface WaterBalanceOptions {
  /** Riego aplicado por fecha (mm). */
  irrigation?: Record<string, number>;
  /** Cuenta los días con lluvia pero sin temperatura (sin restar consumo) en vez de descartarlos. */
  keepWithoutEt?: boolean;
}

/**
 * Balance diario desde la siembra: lluvia + riego - consumo. Un día sin lluvia no cuenta (no se supone 0 mm): CHIRPS
 * preliminar llega con unos días de atraso. Un día sin temperatura se descarta, salvo con `keepWithoutEt`, que lo cuenta
 * sin consumo y lo declara en `etMissingDays`. `days` debe venir ordenado por fecha y empezar en la siembra o después.
 */
export function waterBalance(
  days: BalanceDay[],
  crop: Crop,
  sowingDate: string,
  latDeg: number,
  opts: WaterBalanceOptions = {},
): WaterBalanceResult | null {
  if (!CROP_KC[crop]) return null;
  const sow = Date.parse(`${sowingDate}T00:00:00Z`);
  const series: WaterBalanceResult["series"] = [];
  const missing: boolean[] = [];
  let cum = 0;
  let rainMm = 0;
  let irrMm = 0;
  let etcMm = 0;
  for (const d of days) {
    if (d.date < sowingDate || d.rainMm === null) continue;
    const noEt = d.tminC === null || d.tmaxC === null;
    if (noEt && !opts.keepWithoutEt) continue;
    const kc = cropKc(crop, Math.round((Date.parse(`${d.date}T00:00:00Z`) - sow) / 86_400_000));
    if (kc === null) continue;
    const etc = noEt ? null : et0Hargreaves(d.tminC!, d.tmaxC!, latDeg, dayOfYearIso(d.date)) * kc;
    const irr = opts.irrigation?.[d.date] ?? 0;
    cum += d.rainMm + irr - (etc ?? 0);
    rainMm += d.rainMm;
    irrMm += irr;
    etcMm += etc ?? 0;
    missing.push(noEt);
    series.push({ date: d.date, rainMm: round1(d.rainMm), irrigationMm: round1(irr), etcMm: etc === null ? null : round1(etc), cumMm: round1(cum) });
  }
  if (!series.length) return null;
  const L = LIMITS.waterBalance;
  const last = series.slice(-L.recentDays);
  const lastMissing = missing.slice(-L.recentDays);
  const full = last.length >= L.recentDays && !lastMissing.some(Boolean);
  const balance14 = last.length >= L.recentDays ? last.reduce((a, x) => a + x.rainMm + x.irrigationMm - (x.etcMm ?? 0), 0) : null;
  return {
    days: series.length,
    rainMm: round1(rainMm),
    irrigationMm: round1(irrMm),
    etcMm: round1(etcMm),
    etMissingDays: missing.filter(Boolean).length,
    balanceMm: round1(rainMm + irrMm - etcMm),
    balance14Mm: balance14 === null ? null : round1(balance14),
    risk: !full || balance14 === null ? null : balance14 <= L.highRiskMm ? "high" : balance14 <= L.mediumRiskMm ? "medium" : "low",
    series,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
