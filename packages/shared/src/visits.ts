/**
 * T-07: lotes sin visitar. Un lote está sin visitar si su última anotación (o recorrida) es de hace más de N días,
 * o si nunca tuvo una. La web deja elegir N; la app usa el valor por defecto.
 */
import { LIMITS } from "./limits";

const DAY_MS = 86_400_000;

/** N válido (uno de los que ofrece la pantalla); cualquier otra cosa vuelve al valor por defecto. */
export const staleDaysOrDefault = (n: unknown): number =>
  LIMITS.visits.staleDayOptions.includes(n as never) ? (n as number) : LIMITS.visits.defaultStaleDays;

/** True si el lote no se visita hace más de `days` días (`lastVisitAt` en epoch ms, o null si nunca). */
export const isStaleVisit = (lastVisitAt: number | null | undefined, days: number, now: number): boolean =>
  !lastVisitAt || lastVisitAt < now - days * DAY_MS;

export const stalePlots = <T extends { lastRecordAt: number | null }>(plots: T[], days: number, now: number): T[] =>
  plots.filter((p) => isStaleVisit(p.lastRecordAt, days, now));
