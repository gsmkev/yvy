/**
 * Cultivo de cada lote según el plan de la campaña activa (A-01). Los trabajos programados (avisos de plagas,
 * heladas, roya) lo usan en lugar del texto libre `plots.crop`, que queda como respaldo cuando el lote no
 * tiene plan. Una consulta por tanda de lotes.
 */
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { chunkForParams, type DB } from "./client";

/** Lote -> cultivo del plan de la campaña activa más reciente. Los lotes sin plan o sin cultivo no aparecen. */
export async function planCropsByPlot(db: DB, plotIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const ids of chunkForParams([...new Set(plotIds)], 1)) {
    const rows = await db
      .select({ plotId: s.plotSeasons.plotId, crop: s.plotSeasons.crop })
      .from(s.plotSeasons)
      .innerJoin(s.seasons, eq(s.seasons.id, s.plotSeasons.seasonId))
      .where(
        and(
          inArray(s.plotSeasons.plotId, ids),
          isNotNull(s.plotSeasons.crop),
          isNull(s.plotSeasons.deletedAt),
          isNull(s.seasons.deletedAt),
          eq(s.seasons.active, true),
        ),
      )
      .orderBy(desc(s.seasons.startDate), desc(s.seasons.createdAt));
    // Ordenadas de la campaña más reciente a la más vieja: la primera de cada lote es la vigente.
    for (const r of rows) if (r.crop && !out.has(r.plotId)) out.set(r.plotId, r.crop);
  }
  return out;
}

/** Los mismos lotes con `crop` tomado del plan cuando lo hay. */
export async function withPlanCrops<T extends { id: string; crop: string | null }>(db: DB, plots: T[]): Promise<T[]> {
  if (!plots.length) return plots;
  const plan = await planCropsByPlot(
    db,
    plots.map((p) => p.id),
  );
  return plots.map((p) => (plan.has(p.id) ? { ...p, crop: plan.get(p.id)! } : p));
}
