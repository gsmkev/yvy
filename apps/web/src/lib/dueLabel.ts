import { fmtIsoDate } from "./format";
import { t } from "./i18n";

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Días de `iso` respecto de `today` (negativo = ya pasó). Ambos "AAAA-MM-DD". */
export const daysFrom = (today: string, iso: string) => dayNum(iso) - dayNum(today);

/** Fecha límite en palabras cuando importa la urgencia; lejos, la fecha dd/mm/aaaa. */
export function dueLabel(iso: string, today: string, overdue = false): string {
  const n = daysFrom(today, iso);
  if (n === 0) return overdue ? t("ui.dueLateToday") : t("ui.dueToday");
  if (n === 1) return t("ui.dueTomorrow");
  if (n === -1) return t("ui.dueYesterday");
  if (n < 0) return t("ui.dueLateDays", { n: -n });
  if (n <= 6) return t("ui.dueInDays", { n });
  return fmtIsoDate(iso);
}
