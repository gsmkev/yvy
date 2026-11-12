/**
 * Análisis de suelo (A-30): resultados de laboratorio por lote o por punto de muestreo.
 * Solo la web los usa (no están en el pull del sync). Escribe y lee quien edita el campo (no el empleado).
 */
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { fertilityPointCounts, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "./client";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export const MAX_SOIL_SAMPLES_PER_FARM = 5_000;

export interface SoilInput {
  plotId: string | null;
  pointLabel: string | null;
  lon: number | null;
  lat: number | null;
  sampledOn: string;
  depthCm: number;
  lab: string | null;
  ph: number | null;
  pMgKg: number | null;
  kCmolKg: number | null;
  omPct: number | null;
  note: string | null;
}

async function requirePlotInFarm(sdb: ScopedDb, farmId: string, plotId: string) {
  const [p] = await sdb.db
    .select({ id: s.plots.id })
    .from(s.plots)
    .where(
      and(
        eq(s.plots.id, plotId),
        eq(s.plots.farmId, farmId),
        eq(s.plots.organizationId, sdb.auth.orgId),
        isNull(s.plots.deletedAt),
      ),
    )
    .limit(1);
  if (!p) throw new NotFoundError("Lote inexistente");
}

export async function listSoilSamples(sdb: ScopedDb, farmId: string) {
  sdb.require(can.editField);
  await sdb.requireFarm(farmId);
  return sdb.db
    .select({
      id: s.soilSamples.id,
      plotId: s.soilSamples.plotId,
      plotName: s.plots.name,
      pointLabel: s.soilSamples.pointLabel,
      lon: s.soilSamples.lon,
      lat: s.soilSamples.lat,
      sampledOn: s.soilSamples.sampledOn,
      depthCm: s.soilSamples.depthCm,
      lab: s.soilSamples.lab,
      ph: s.soilSamples.ph,
      pMgKg: s.soilSamples.pMgKg,
      kCmolKg: s.soilSamples.kCmolKg,
      omPct: s.soilSamples.omPct,
      note: s.soilSamples.note,
    })
    .from(s.soilSamples)
    .leftJoin(s.plots, eq(s.plots.id, s.soilSamples.plotId))
    .where(
      and(
        eq(s.soilSamples.farmId, farmId),
        eq(s.soilSamples.organizationId, sdb.auth.orgId),
        isNull(s.soilSamples.deletedAt),
      ),
    )
    .orderBy(desc(s.soilSamples.sampledOn), desc(s.soilSamples.createdAt))
    .limit(1000);
}

/** A-31: ¿hay puntos suficientes para algún mapa? Cuenta ubicaciones distintas con coordenadas y valor por parámetro. */
export async function fertilityPointCountsOf(sdb: ScopedDb, farmId: string) {
  sdb.require(can.editField);
  await sdb.requireFarm(farmId);
  const rows = await sdb.db
    .select({ lon: s.soilSamples.lon, lat: s.soilSamples.lat, ph: s.soilSamples.ph, pMgKg: s.soilSamples.pMgKg, kCmolKg: s.soilSamples.kCmolKg, omPct: s.soilSamples.omPct })
    .from(s.soilSamples)
    .where(and(eq(s.soilSamples.farmId, farmId), eq(s.soilSamples.organizationId, sdb.auth.orgId), isNull(s.soilSamples.deletedAt), isNotNull(s.soilSamples.lon), isNotNull(s.soilSamples.lat)))
    .limit(MAX_SOIL_SAMPLES_PER_FARM);
  return fertilityPointCounts(rows);
}

export async function createSoilSample(sdb: ScopedDb, farmId: string, input: SoilInput) {
  sdb.require(can.editField);
  await sdb.requireFarm(farmId);
  if (input.plotId) await requirePlotInFarm(sdb, farmId, input.plotId);
  const [n] = await sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.soilSamples)
    .where(
      and(
        eq(s.soilSamples.farmId, farmId),
        eq(s.soilSamples.organizationId, sdb.auth.orgId),
        isNull(s.soilSamples.deletedAt),
      ),
    );
  if (Number(n?.n ?? 0) >= MAX_SOIL_SAMPLES_PER_FARM)
    throw new HTTPException(400, { message: "Demasiados análisis en la estancia" });
  const id = newId();
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.soilSamples).values({
      ...input,
      id,
      organizationId: sdb.auth.orgId,
      farmId,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
  return { id };
}

async function requireSample(sdb: ScopedDb, id: string) {
  const [row] = await sdb.db
    .select({ id: s.soilSamples.id, farmId: s.soilSamples.farmId })
    .from(s.soilSamples)
    .where(
      and(
        eq(s.soilSamples.id, id),
        eq(s.soilSamples.organizationId, sdb.auth.orgId),
        isNull(s.soilSamples.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
  return row;
}

export async function updateSoilSample(sdb: ScopedDb, id: string, patch: Partial<SoilInput>) {
  sdb.require(can.editField);
  const row = await requireSample(sdb, id);
  if (patch.plotId) await requirePlotInFarm(sdb, row.farmId, patch.plotId);
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.soilSamples)
      .set({ ...patch, updatedAt: sdb.now(), version: currentVersion })
      .where(and(eq(s.soilSamples.id, id), eq(s.soilSamples.organizationId, sdb.auth.orgId))),
  ]);
}

export async function deleteSoilSample(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  await requireSample(sdb, id);
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.soilSamples)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.soilSamples.id, id), eq(s.soilSamples.organizationId, sdb.auth.orgId))),
  ]);
}
