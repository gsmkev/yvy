/** Comparación de campañas de vigor (S-03): una curva de NDVI por campaña, superpuestas desde el inicio de la campaña. */

/** La campaña agrícola va de julio a junio: la 2024/25 empieza el 1 de julio de 2024. */
const START_MONTH = 6; // julio (0-based)
const DAY_MS = 86_400_000;
const BUCKET_DAYS = 7;

export interface VigorPoint {
  acquiredAt: number;
  mean: number;
}

export interface CampaignSeries {
  startYear: number;
  label: string;
  /** x = día de la campaña (múltiplo de 7), y = NDVI medio de esa semana. */
  points: { x: number; y: number }[];
}

export function campaignStartYear(ts: number): number {
  const d = new Date(ts);
  return d.getUTCMonth() >= START_MONTH ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export const campaignLabel = (startYear: number): string => `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;

/** Días desde el 1 de julio de la campaña. */
export function dayOfCampaign(ts: number): number {
  return Math.floor((ts - Date.UTC(campaignStartYear(ts), START_MONTH, 1)) / DAY_MS);
}

/** Las campañas más nuevas primero, hasta `max`; promedia por semana para que las curvas se alineen. */
export function groupCampaigns(series: VigorPoint[], max = 6): CampaignSeries[] {
  const byYear = new Map<number, Map<number, number[]>>();
  for (const p of series) {
    const y = campaignStartYear(p.acquiredAt);
    const x = Math.floor(dayOfCampaign(p.acquiredAt) / BUCKET_DAYS) * BUCKET_DAYS;
    const weeks = byYear.get(y) ?? new Map<number, number[]>();
    weeks.set(x, [...(weeks.get(x) ?? []), p.mean]);
    byYear.set(y, weeks);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, max)
    .map(([startYear, weeks]) => ({
      startYear,
      label: campaignLabel(startYear),
      points: [...weeks.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([x, v]) => ({ x, y: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 })),
    }));
}

const month = new Intl.DateTimeFormat("es-PY", { month: "short", timeZone: "UTC" });
/** Mes del día de campaña (1 de julio = 0). Año de referencia no bisiesto. */
export const campaignDayLabel = (x: number): string => month.format(new Date(Date.UTC(2001, START_MONTH, 1) + x * DAY_MS)).replace(".", "");

/** Años de campaña distintos con datos: sirve para decidir si ya hay con qué comparar. */
export const campaignCount = (series: VigorPoint[]): number => new Set(series.map((p) => campaignStartYear(p.acquiredAt))).size;
