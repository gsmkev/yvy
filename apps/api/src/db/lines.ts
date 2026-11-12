/**
 * Líneas del mapa (M-20): alambrados, caminos internos y cañerías de una estancia, con su largo.
 * Solo la web las usa por ahora (no están en el pull del sync). Escribe quien edita el campo
 * (dueño, administrador, agrónomo); el empleado las ve si tiene lotes asignados en la estancia.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { bboxOf, lineLengthM } from "@yvy/geo";
import { LIMITS, newId, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { LineString } from "geojson";
import { bumpVersion, currentVersion, runBatch } from "./client";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export async function listFarmLines(sdb: ScopedDb, farmId: string) {
  await sdb.requireFarmVisible(farmId);
  return sdb.db
    .select({
      id: s.farmLines.id,
      farmId: s.farmLines.farmId,
      kind: s.farmLines.kind,
      name: s.farmLines.name,
      geometry: s.farmLines.geometry,
      lengthM: s.farmLines.lengthM,
    })
    .from(s.farmLines)
    .where(
      and(eq(s.farmLines.farmId, farmId), eq(s.farmLines.organizationId, sdb.auth.orgId), isNull(s.farmLines.deletedAt)),
    )
    .orderBy(asc(s.farmLines.kind), asc(s.farmLines.name));
}

export async function createLine(
  sdb: ScopedDb,
  farmId: string,
  input: { kind: (typeof s.LINE_KINDS)[number]; name: string; geometry: LineString },
) {
  sdb.require(can.editField);
  await sdb.requireFarm(farmId);
  const [n] = await sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.farmLines)
    .where(
      and(eq(s.farmLines.farmId, farmId), eq(s.farmLines.organizationId, sdb.auth.orgId), isNull(s.farmLines.deletedAt)),
    );
  if (Number(n?.n ?? 0) >= LIMITS.geometry.maxLinesPerFarm)
    throw new HTTPException(400, { message: t("ui.linesTooMany", { max: LIMITS.geometry.maxLinesPerFarm }) });
  const id = newId();
  const ts = sdb.now();
  const lengthM = lineLengthM(input.geometry);
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.farmLines).values({
      id,
      organizationId: sdb.auth.orgId,
      farmId,
      kind: input.kind,
      name: input.name,
      geometry: JSON.stringify(input.geometry),
      ...bboxOf(input.geometry as never),
      lengthM,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
  return { id, lengthM };
}

async function requireLine(sdb: ScopedDb, id: string) {
  const [row] = await sdb.db
    .select({ id: s.farmLines.id })
    .from(s.farmLines)
    .where(
      and(eq(s.farmLines.id, id), eq(s.farmLines.organizationId, sdb.auth.orgId), isNull(s.farmLines.deletedAt)),
    )
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
}

export async function updateLine(
  sdb: ScopedDb,
  id: string,
  patch: { name?: string; kind?: (typeof s.LINE_KINDS)[number] },
) {
  sdb.require(can.editField);
  await requireLine(sdb, id);
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.farmLines)
      .set({ ...patch, updatedAt: sdb.now(), version: currentVersion })
      .where(and(eq(s.farmLines.id, id), eq(s.farmLines.organizationId, sdb.auth.orgId))),
  ]);
}

export async function deleteLine(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  await requireLine(sdb, id);
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.farmLines)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.farmLines.id, id), eq(s.farmLines.organizationId, sdb.auth.orgId))),
  ]);
}
