import type { Farm, Plot } from "../db/store";

export interface FarmChoice {
  /** Estancias con lotes: las que se pueden elegir. */
  options: Farm[];
  /** La estancia que filtra las pantallas; null si no hay selector (una sola estancia o ninguna). */
  current: Farm | null;
  /** Hay más de una estancia con lotes. */
  multi: boolean;
}

export function resolveFarmChoice(farms: Farm[], plots: Pick<Plot, "farmId">[], savedId: string | null): FarmChoice {
  const withPlots = new Set(plots.map((p) => p.farmId));
  const options = farms.filter((f) => withPlots.has(f.id));
  const multi = options.length > 1;
  const current = multi ? (options.find((f) => f.id === savedId) ?? options[0]!) : null;
  return { options, current, multi };
}

/** Filtra por estancia solo cuando hay selector. */
export const byFarm = <T extends { farmId: string }>(rows: T[], farmId: string | null): T[] =>
  farmId ? rows.filter((r) => r.farmId === farmId) : rows;
