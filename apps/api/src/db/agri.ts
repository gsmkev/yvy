/**
 * Agricultura (ADR 0004): campañas, plan por lote e historial de rotación.
 * Toda escritura a tablas sincronizables: bumpVersion() primero y `version: currentVersion` en la fila.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "./client";
import { updateSynced } from "./queries";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export interface SeasonInput {
  name: string;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

export interface PlotSeasonInput {
  crop: (typeof s.CROPS)[number] | null;
  variety: string | null;
  plannedSowingDate: string | null;
  targetYieldTHa: number | null;
}

/** Campañas de la organización y, con `farmId`, el plan de los lotes de esa estancia (2 consultas). */
export async function listSeasons(sdb: ScopedDb, farmId?: string) {
  const org = sdb.auth.orgId;
  const [seasons, plotSeasons] = await Promise.all([
    sdb.db
      .select()
      .from(s.seasons)
      .where(and(eq(s.seasons.organizationId, org), isNull(s.seasons.deletedAt)))
      .orderBy(desc(s.seasons.active), desc(s.seasons.startDate), desc(s.seasons.createdAt)),
    sdb.db
      .select()
      .from(s.plotSeasons)
      .where(
        and(
          eq(s.plotSeasons.organizationId, org),
          isNull(s.plotSeasons.deletedAt),
          sdb.workerFilter("plot_seasons"),
          farmId
            ? inArray(
                s.plotSeasons.plotId,
                sdb.db
                  .select({ id: s.plots.id })
                  .from(s.plots)
                  .where(and(eq(s.plots.farmId, farmId), eq(s.plots.organizationId, org))),
              )
            : undefined,
        ),
      ),
  ]);
  return { seasons, plotSeasons };
}

export async function createSeason(sdb: ScopedDb, input: SeasonInput) {
  sdb.require(can.editSeasons);
  const id = newId();
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.seasons).values({
      ...input,
      id,
      organizationId: sdb.auth.orgId,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
  return { id };
}

export async function updateSeason(sdb: ScopedDb, id: string, patch: Partial<SeasonInput>) {
  sdb.require(can.editSeasons);
  await updateSynced(sdb, s.seasons, id, patch);
}

/** Borra la campaña y su plan por lote (los registros ya cargados quedan con su seasonId). */
export async function deleteSeason(sdb: ScopedDb, id: string) {
  sdb.require(can.editSeasons);
  const ts = sdb.now();
  await updateSynced(sdb, s.seasons, id, { deletedAt: ts }, [
    sdb.db
      .update(s.plotSeasons)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(
        and(
          eq(s.plotSeasons.organizationId, sdb.auth.orgId),
          eq(s.plotSeasons.seasonId, id),
          isNull(s.plotSeasons.deletedAt),
        ),
      ),
  ]);
}

async function requirePlotAndSeason(sdb: ScopedDb, plotId: string, seasonId: string) {
  const org = sdb.auth.orgId;
  const [[plot], [season]] = await Promise.all([
    sdb.db
      .select({ id: s.plots.id })
      .from(s.plots)
      .where(and(eq(s.plots.id, plotId), eq(s.plots.organizationId, org), isNull(s.plots.deletedAt)))
      .limit(1),
    sdb.db
      .select({ id: s.seasons.id })
      .from(s.seasons)
      .where(and(eq(s.seasons.id, seasonId), eq(s.seasons.organizationId, org), isNull(s.seasons.deletedAt)))
      .limit(1),
  ]);
  if (!plot) throw new NotFoundError("Lote inexistente");
  if (!season) throw new NotFoundError("Campaña inexistente");
}

/** Alta o cambio del plan de un lote en una campaña (una fila por lote y campaña). */
export async function upsertPlotSeason(sdb: ScopedDb, plotId: string, seasonId: string, input: PlotSeasonInput) {
  sdb.require(can.editSeasons);
  await requirePlotAndSeason(sdb, plotId, seasonId);
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .insert(s.plotSeasons)
      .values({
        ...input,
        id: newId(),
        organizationId: sdb.auth.orgId,
        plotId,
        seasonId,
        createdAt: ts,
        updatedAt: ts,
        version: currentVersion,
      })
      .onConflictDoUpdate({
        target: [s.plotSeasons.plotId, s.plotSeasons.seasonId],
        set: { ...input, deletedAt: null, updatedAt: ts, version: currentVersion },
      }),
  ]);
}

export async function deletePlotSeason(sdb: ScopedDb, plotId: string, seasonId: string) {
  sdb.require(can.editSeasons);
  const ts = sdb.now();
  const where = and(
    eq(s.plotSeasons.organizationId, sdb.auth.orgId),
    eq(s.plotSeasons.plotId, plotId),
    eq(s.plotSeasons.seasonId, seasonId),
    isNull(s.plotSeasons.deletedAt),
  );
  const [row] = await sdb.db.select({ id: s.plotSeasons.id }).from(s.plotSeasons).where(where).limit(1);
  if (!row) throw new NotFoundError("El lote no tiene plan en esa campaña");
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.update(s.plotSeasons).set({ deletedAt: ts, updatedAt: ts, version: currentVersion }).where(where),
  ]);
}

export interface PlotHistoryRow {
  seasonId: string;
  seasonName: string;
  startDate: string | null;
  crop: string | null;
  variety: string | null;
  plannedSowingDate: string | null;
  targetYieldTHa: number | null;
  /** Fecha real de siembra (registro `sowing`), si hay. */
  sownOn: number | null;
}

/**
 * Historial de rotación de un lote (A-02): una fila por campaña con lo planificado (plot_seasons) y, si
 * hay un registro de siembra de esa campaña, lo que realmente se sembró. Más reciente primero.
 * 4 consultas, sin N+1.
 */
export async function plotHistory(sdb: ScopedDb, plotId: string): Promise<PlotHistoryRow[]> {
  const org = sdb.auth.orgId;
  const [plot] = await sdb.db
    .select({ id: s.plots.id })
    .from(s.plots)
    .where(
      and(
        eq(s.plots.id, plotId),
        eq(s.plots.organizationId, org),
        isNull(s.plots.deletedAt),
        sdb.workerFilter("plots"),
      ),
    )
    .limit(1);
  if (!plot) throw new NotFoundError("Lote inexistente");
  const [plans, seasons, sowings] = await Promise.all([
    sdb.db
      .select()
      .from(s.plotSeasons)
      .where(
        and(eq(s.plotSeasons.plotId, plotId), eq(s.plotSeasons.organizationId, org), isNull(s.plotSeasons.deletedAt)),
      ),
    sdb.db
      .select()
      .from(s.seasons)
      .where(and(eq(s.seasons.organizationId, org), isNull(s.seasons.deletedAt)))
      .orderBy(asc(s.seasons.startDate)),
    sdb.db
      .select({ data: s.records.data, capturedAt: s.records.capturedAt })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, org),
          eq(s.records.plotId, plotId),
          eq(s.records.kind, "sowing"),
          isNull(s.records.deletedAt),
        ),
      )
      .orderBy(asc(s.records.capturedAt)),
  ]);
  const planBySeason = new Map(plans.map((p) => [p.seasonId, p]));
  const sownBySeason = new Map<string, { crop: string; variety: string | null; at: number }>();
  for (const r of sowings) {
    const d = JSON.parse(r.data) as { seasonId?: string; crop?: string; variety?: string };
    if (d.seasonId && d.crop)
      sownBySeason.set(d.seasonId, { crop: d.crop, variety: d.variety ?? null, at: r.capturedAt });
  }
  const rows: PlotHistoryRow[] = [];
  for (const season of seasons) {
    const plan = planBySeason.get(season.id);
    const sown = sownBySeason.get(season.id);
    if (!plan && !sown) continue;
    rows.push({
      seasonId: season.id,
      seasonName: season.name,
      startDate: season.startDate,
      // Lo sembrado de verdad manda sobre lo planificado.
      crop: sown?.crop ?? plan?.crop ?? null,
      variety: sown?.variety ?? plan?.variety ?? null,
      plannedSowingDate: plan?.plannedSowingDate ?? null,
      targetYieldTHa: plan?.targetYieldTHa ?? null,
      sownOn: sown?.at ?? null,
    });
  }
  return rows.sort(
    (a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "") || b.seasonName.localeCompare(a.seasonName),
  );
}

// ---------- Productos (catálogo) ----------

export interface ProductInput {
  name: string;
  type: (typeof s.PRODUCT_TYPES)[number];
  unit: (typeof s.PRODUCT_UNITS)[number];
  activeIngredient: string | null;
  withdrawalDays: number | null;
  toxClass: string | null;
}

export async function listProducts(sdb: ScopedDb) {
  return sdb.db
    .select()
    .from(s.products)
    .where(and(eq(s.products.organizationId, sdb.auth.orgId), isNull(s.products.deletedAt)))
    .orderBy(asc(s.products.name));
}

export async function createProduct(sdb: ScopedDb, input: ProductInput) {
  sdb.require(can.editProducts);
  const id = newId();
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.products).values({
      ...input,
      id,
      organizationId: sdb.auth.orgId,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
  return { id };
}

export async function updateProduct(sdb: ScopedDb, id: string, patch: Partial<ProductInput>) {
  sdb.require(can.editProducts);
  await updateSynced(sdb, s.products, id, patch);
}

export async function deleteProduct(sdb: ScopedDb, id: string) {
  sdb.require(can.editProducts);
  await updateSynced(sdb, s.products, id, { deletedAt: sdb.now() });
}
