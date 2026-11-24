/**
 * Formato del informe de riesgo climático. Lo que depende del idioma de la plataforma (el nombre del mes) lo
 * pone cada app: la web con Intl, la app con una tabla, porque Hermes no siempre trae Intl completo.
 */
import type { FarmRisk } from "./risk";

/** Respuesta del informe de riesgo: cuándo se calculó y el informe (null si todavía no hay). */
export interface RiskResponse {
  computedAt: number | null;
  report: FarmRisk | null;
}

/** 1..12 → "enero" / "ene". */
export type MonthName = (month: number, short?: boolean) => string;

/** Porcentaje de lo normal (100 = igual); null si no hay normal. */
export const pctOfNormal = (mm: number, normal: number | null): number | null =>
  normal ? Math.round((mm / normal) * 100) : null;

/** Funciones de formato del informe de riesgo; `monthName` aporta el nombre del mes del idioma de la plataforma. */
export function riskFormat(monthName: MonthName) {
  /** "06-20" → "20 de junio"; null → "—". */
  const fmtMmDd = (v: string | null): string => {
    if (!v) return "—";
    const [m, d] = v.split("-").map(Number) as [number, number];
    return `${d} de ${monthName(m)}`;
  };

  /** "2026-10" → "oct 26" con el mes abreviado. */
  const fmtYearMonth = (ym: string): string => {
    const [y, m] = ym.split("-").map(Number) as [number, number];
    return `${monthName(m, true)} ${String(y).slice(2)}`;
  };

  /** Meses de los últimos 12 con su normal (para el gráfico y la tabla); la normal sale del mes del año. */
  const rainByMonth = (r: FarmRisk["rain"]) => {
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
  };

  /** Focos por mes con el nombre del mes, para el gráfico de columnas. */
  const fireByMonth = (by: number[]) => by.map((value, i) => ({ label: monthName(i + 1, true), value }));

  return { fmtMmDd, fmtYearMonth, rainByMonth, fireByMonth };
}
