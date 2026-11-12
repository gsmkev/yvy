/** Mapas sin conexión de varias estancias (F-26): qué falta bajar y cuánto pesa. Puro; la descarga está en offline.ts. */

export interface PackInfo {
  farmId: string;
  name: string;
  /** Capas con imagen en el servidor (0 = esta estancia todavía no tiene mapa para bajar). */
  layerCount: number;
  upToDate: boolean;
  missingBytes: number;
}

export interface DownloadPlan {
  /** Estancias con algo para bajar y que entran en el tope de mapas, en orden alfabético. */
  farms: PackInfo[];
  /** Estancias con algo para bajar que no entran en el tope (LIMITS.offline.maxMapBytes): se bajan de a una tras liberar lugar. */
  overBudget: PackInfo[];
  totalBytes: number;
  /** Estancias que no tienen imagen todavía: no se pueden bajar y no cuentan como pendientes. */
  withoutImagery: number;
}

export interface Budget {
  /** Lo que ya ocupan los mapas bajados. */
  usedBytes: number;
  maxBytes: number;
}

/** ¿Entra `missingBytes` más sin pasar el tope de mapas? */
export const fitsBudget = (missingBytes: number, b: Budget): boolean => b.usedBytes + missingBytes <= b.maxBytes;

export function planDownloads(packs: PackInfo[], budget: Budget = { usedBytes: 0, maxBytes: Infinity }): DownloadPlan {
  const pending = packs
    .filter((p) => p.layerCount > 0 && !p.upToDate)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  // En orden alfabético se agregan las que caben; las que se pasan del tope quedan aparte (una más chica puede entrar después).
  const farms: PackInfo[] = [];
  const overBudget: PackInfo[] = [];
  let used = budget.usedBytes;
  for (const p of pending) {
    if (used + p.missingBytes <= budget.maxBytes) {
      farms.push(p);
      used += p.missingBytes;
    } else overBudget.push(p);
  }
  return {
    farms,
    overBudget,
    totalBytes: farms.reduce((a, p) => a + p.missingBytes, 0),
    withoutImagery: packs.filter((p) => p.layerCount === 0).length,
  };
}

/**
 * Progreso global (0 a 1) de una bajada en fila: las estancias ya terminadas más la fracción de la actual,
 * ponderadas por peso, para que la barra no salte cuando una estancia es mucho más grande que otra.
 */
export function overallProgress(plan: DownloadPlan, doneFarmIds: string[], currentId: string | null, currentFraction: number): number {
  if (plan.totalBytes <= 0) return 1;
  let done = 0;
  for (const f of plan.farms) {
    if (doneFarmIds.includes(f.farmId)) done += f.missingBytes;
    else if (f.farmId === currentId) done += f.missingBytes * Math.min(1, Math.max(0, currentFraction));
  }
  return Math.min(1, done / plan.totalBytes);
}
