/**
 * Mapas de rendimiento de la cosechadora (A-21). El archivo lo procesa el navegador (el Worker no parsea archivos
 * grandes): acá solo se valida la forma del resumen y se guarda. Un mapa nuevo del mismo lote y campaña reemplaza al
 * anterior. Lo ve y escribe quien edita el campo (no el empleado).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requirePlotRow } from "./agri2";
import { bumpVersion, currentVersion, runBatch } from "./client";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export interface YieldMapInput {
  seasonId: string | null;
  fileName: string;
  nPoints: number;
  nDropped: number;
  meanTHa: number;
  p10THa: number;
  p90THa: number;
  minTHa: number;
  maxTHa: number;
  cvPct: number;
  cellM: number;
  cells: [number, number, number, number][];
}

export async function listYieldMaps(sdb: ScopedDb, plotId: string) {
  sdb.require(can.editField);
  await requirePlotRow(sdb, plotId);
  return sdb.db
    .select({
      id: s.yieldMaps.id,
      seasonId: s.yieldMaps.seasonId,
      seasonName: s.seasons.name,
      fileName: s.yieldMaps.fileName,
      nPoints: s.yieldMaps.nPoints,
      nDropped: s.yieldMaps.nDropped,
      meanTHa: s.yieldMaps.meanTHa,
      p10THa: s.yieldMaps.p10THa,
      p90THa: s.yieldMaps.p90THa,
      minTHa: s.yieldMaps.minTHa,
      maxTHa: s.yieldMaps.maxTHa,
      cvPct: s.yieldMaps.cvPct,
      cellM: s.yieldMaps.cellM,
      cells: s.yieldMaps.cells,
      createdAt: s.yieldMaps.createdAt,
    })
    .from(s.yieldMaps)
    .leftJoin(s.seasons, eq(s.seasons.id, s.yieldMaps.seasonId))
    .where(
      and(
        eq(s.yieldMaps.plotId, plotId),
        eq(s.yieldMaps.organizationId, sdb.auth.orgId),
        isNull(s.yieldMaps.deletedAt),
      ),
    )
    .orderBy(desc(s.yieldMaps.createdAt))
    .limit(10);
}

export async function createYieldMap(sdb: ScopedDb, plotId: string, input: YieldMapInput) {
  sdb.require(can.editField);
  const plot = await requirePlotRow(sdb, plotId);
  const org = sdb.auth.orgId;
  if (input.seasonId) {
    const [season] = await sdb.db
      .select({ id: s.seasons.id })
      .from(s.seasons)
      .where(and(eq(s.seasons.id, input.seasonId), eq(s.seasons.organizationId, org), isNull(s.seasons.deletedAt)))
      .limit(1);
    if (!season) throw new NotFoundError("Campaña inexistente");
  }
  const id = newId();
  const ts = sdb.now();
  const { cells, ...rest } = input;
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    // el mapa nuevo reemplaza al anterior del mismo lote y campaña
    sdb.db
      .update(s.yieldMaps)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(
        and(
          eq(s.yieldMaps.plotId, plotId),
          eq(s.yieldMaps.organizationId, org),
          input.seasonId ? eq(s.yieldMaps.seasonId, input.seasonId) : isNull(s.yieldMaps.seasonId),
          isNull(s.yieldMaps.deletedAt),
        ),
      ),
    sdb.db.insert(s.yieldMaps).values({
      ...rest,
      cells: JSON.stringify(cells),
      id,
      organizationId: org,
      farmId: plot.farmId,
      plotId,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
  return { id };
}

export async function deleteYieldMap(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  const [row] = await sdb.db
    .select({ id: s.yieldMaps.id })
    .from(s.yieldMaps)
    .where(and(eq(s.yieldMaps.id, id), eq(s.yieldMaps.organizationId, sdb.auth.orgId), isNull(s.yieldMaps.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.yieldMaps)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.yieldMaps.id, id), eq(s.yieldMaps.organizationId, sdb.auth.orgId))),
  ]);
}
