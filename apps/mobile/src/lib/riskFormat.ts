/** Formato del informe de riesgo climático (copia de apps/web/src/lib/riskData.ts, sin Intl). */
import type { FarmRisk } from "@yvy/shared";

export interface RiskResponse {
  computedAt: number | null;
  report: FarmRisk | null;
}

const LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** 1..12 → "enero" / "ene". */
export const monthName = (m: number, short = false): string => (short ? LONG[m - 1]!.slice(0, 3) : LONG[m - 1]!);

/** "06-20" → "20 de junio"; null → "—". */
export function fmtMmDd(v: string | null): string {
  if (!v) return "—";
  const [m, d] = v.split("-").map(Number) as [number, number];
  return `${d} de ${monthName(m)}`;
}

/** "2026-10" → "oct 26". */
export const fmtYearMonth = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${monthName(m, true)} ${String(y).slice(2)}`;
};

/** Meses de los últimos 12 con su normal. */
export function rainByMonth(r: FarmRisk["rain"]) {
  const normal = new Map(r.normal.map((n) => [n.month, n]));
  return r.recent.map((x) => ({ key: x.month, label: fmtYearMonth(x.month), mm: x.mm, normalMm: normal.get(Number(x.month.slice(5)))?.meanMm ?? null }));
}

export const fireByMonth = (by: number[]) => by.map((value, i) => ({ label: monthName(i + 1, true), value }));
