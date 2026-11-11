/** Formato del informe de riesgo climático (C-10), compartido por la pantalla y el PDF. */
import type { FarmRisk } from "@yvy/shared";

export interface RiskResponse {
  computedAt: number | null;
  report: FarmRisk | null;
}

const monthLong = new Intl.DateTimeFormat("es-PY", { month: "long", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("es-PY", { month: "short", timeZone: "UTC" });

/** 1..12 → "enero" / "ene". */
export const monthName = (m: number, short = false): string =>
  (short ? monthShort : monthLong).format(new Date(Date.UTC(2001, m - 1, 15))).replace(".", "");

/** "06-20" → "20 de junio"; null → "—". */
export function fmtMmDd(v: string | null): string {
  if (!v) return "—";
  const [m, d] = v.split("-").map(Number) as [number, number];
  return `${d} de ${monthName(m)}`;
}

/** "2026-10" → "oct. 26" con el mes abreviado. */
export const fmtYearMonth = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${monthName(m, true)} ${String(y).slice(2)}`;
};

/** Meses de los últimos 12 con su normal (para el gráfico y la tabla); la normal sale del mes del año. */
export function rainByMonth(r: FarmRisk["rain"]) {
  const normal = new Map(r.normal.map((n) => [n.month, n]));
  return r.recent.map((x) => {
    const n = normal.get(Number(x.month.slice(5)));
    return {
      key: x.month,
      label: fmtYearMonth(x.month),
      mm: x.mm,
      normalMm: n?.meanMm ?? null,
      p20Mm: n?.p20Mm ?? null,
      p80Mm: n?.p80Mm ?? null,
    };
  });
}

/** Porcentaje de lo normal (100 = igual); null si no hay normal. */
export const pctOfNormal = (mm: number, normal: number | null): number | null =>
  normal ? Math.round((mm / normal) * 100) : null;

/** Focos por mes con el nombre del mes, para el gráfico de columnas. */
export const fireByMonth = (by: number[]) => by.map((value, i) => ({ label: monthName(i + 1, true), value }));
