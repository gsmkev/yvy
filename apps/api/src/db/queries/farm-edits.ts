/** Edición y borrado lógico de estancias, lotes y puntos de interés. */
import { and, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { PullTable } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bboxOf, checkPlots, type Area } from "@yvy/geo";
import { newId, t } from "@yvy/shared";
import { HTTPException } from "hono/http-exception";
import { patchDetail, type AuditEntity } from "../audit";
import { bumpVersion, currentVersion, runBatch, type Stmt } from "../client";
import { can, NotFoundError, SYNCED_KEYS, type ScopedDb } from "../scoped";

// ---------- Edición y borrado lógico ----------

type SyncedTbl = SQLiteTable & {
  id: SQLiteColumn;
  organizationId: SQLiteColumn;
  deletedAt: SQLiteColumn;
};

const AUDITED: Partial<Record<PullTable, AuditEntity>> = {
  farms: "farm",
  plots: "plot",
  tasks: "task",
  points_of_interest: "poi",
  products: "product",
  seasons: "season",
};

export async function updateSynced(
  sdb: ScopedDb,
  table: SyncedTbl,
  id: string,
  patch: Record<string, unknown>,
  extra: Stmt[] = [],
) {
  const ts = sdb.now();
  // T-09 / K-05: solo filas de estancias donde puede escribir (las tablas fuera de SYNCED no llevan estancia).
  const key = SYNCED_KEYS.get(table);
  const where = and(
    eq(table.id, id),
    eq(table.organizationId, sdb.auth.orgId),
    isNull(table.deletedAt),
    key ? sdb.workerFilter(key, true) : undefined,
  );
  const exists = await sdb.db.select({ id: table.id }).from(table).where(where).limit(1);
  if (!exists.length) throw new NotFoundError("No existe");
  // K-06: queda en el registro de cambios quién editó o borró qué
  const entity = key && AUDITED[key];
  const deleting = patch.deletedAt != null;
  const audit = entity
    ? sdb.audit({ action: `${entity}_${deleting ? "delete" : "update"}`, entity, entityId: id, detail: deleting ? {} : patchDetail(patch) })
    : [];
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    ...audit,
    sdb.db
      .update(table)
      .set({ ...patch, updatedAt: ts, version: currentVersion })
      .where(where),
    ...extra,
  ]);
}

export async function updateFarm(sdb: ScopedDb, id: string, patch: Partial<typeof s.farms.$inferInsert>) {
  sdb.require(can.editField);
  await updateSynced(sdb, s.farms, id, patch);
}

export async function deleteFarm(sdb: ScopedDb, id: string) {
  sdb.require(can.manageOrg, "Solo el dueño borra estancias");
  const ts = sdb.now();
  const org = sdb.auth.orgId;
  const farmPlots = sql`(SELECT id FROM plots WHERE farm_id = ${id} AND organization_id = ${org})`;
  await updateSynced(sdb, s.farms, id, { deletedAt: ts }, [
    ...cascadeStmts(sdb, inArray(s.plotAssignments.plotId, farmPlots), eq(s.tasks.farmId, id), ts),
    // A-23: las entregas a acopio se van con la estancia
    sdb.db
      .update(s.grainDeliveries)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.grainDeliveries.farmId, id), eq(s.grainDeliveries.organizationId, org), isNull(s.grainDeliveries.deletedAt))),
    // A-30: los análisis de suelo se van con la estancia
    sdb.db
      .update(s.soilSamples)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.soilSamples.farmId, id), eq(s.soilSamples.organizationId, org), isNull(s.soilSamples.deletedAt))),
    // M-20: las líneas del mapa se van con la estancia
    sdb.db
      .update(s.farmLines)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.farmLines.farmId, id), eq(s.farmLines.organizationId, org), isNull(s.farmLines.deletedAt))),
    sdb.db
      .update(s.plots)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.plots.farmId, id), eq(s.plots.organizationId, org))),
  ]);
}

/**
 * Borrado en cascada de un lote o estancia (B1): sube assignments_version de quienes lo tenían asignado
 * (antes de borrar las asignaciones), borra las asignaciones y cancela las tareas abiertas.
 * 3 sentencias dentro del mismo batch.
 */
function cascadeStmts(sdb: ScopedDb, assignWhere: SQL, taskWhere: SQL, ts: number): Stmt[] {
  const org = sdb.auth.orgId;
  return [
    sdb.db
      .update(s.memberships)
      .set({ assignmentsVersion: sql`${s.memberships.assignmentsVersion} + 1`, updatedAt: ts })
      .where(
        and(
          eq(s.memberships.organizationId, org),
          inArray(
            s.memberships.userId,
            sdb.db
              .select({ u: s.plotAssignments.userId })
              .from(s.plotAssignments)
              .where(and(assignWhere, isNull(s.plotAssignments.deletedAt))),
          ),
        ),
      ),
    sdb.db
      .update(s.plotAssignments)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.plotAssignments.organizationId, org), assignWhere, isNull(s.plotAssignments.deletedAt))),
    sdb.db
      .update(s.tasks)
      .set({ status: "cancelled", updatedAt: ts, version: currentVersion })
      .where(and(eq(s.tasks.organizationId, org), taskWhere, eq(s.tasks.status, "open"), isNull(s.tasks.deletedAt))),
  ];
}

export async function updatePlot(sdb: ScopedDb, id: string, patch: Partial<typeof s.plots.$inferInsert>) {
  sdb.require(can.editField);
  await updateSynced(sdb, s.plots, id, patch);
}

/**
 * Avisos no bloqueantes de un lote ya guardado (M-02): cuánto se superpone con los vecinos de su estancia y si
 * sale del perímetro. Presupuesto de CPU: solo vecinos cuyo bbox toca al lote y como máximo 12 recortes exactos.
 */
export async function plotGeometryWarnings(sdb: ScopedDb, plotId: string, geometry: Area) {
  const org = sdb.auth.orgId;
  const [own] = await sdb.db
    .select({ farmId: s.plots.farmId })
    .from(s.plots)
    .where(and(eq(s.plots.id, plotId), eq(s.plots.organizationId, org)))
    .limit(1);
  if (!own) throw new NotFoundError("No existe");
  const box = bboxOf(geometry);
  const [farm] = await sdb.db
    .select({ geometry: s.farms.geometry })
    .from(s.farms)
    .where(and(eq(s.farms.id, own.farmId), eq(s.farms.organizationId, org)))
    .limit(1);
  const neighbors = await sdb.db
    .select({ id: s.plots.id, name: s.plots.name, geometry: s.plots.geometry })
    .from(s.plots)
    .where(
      and(
        eq(s.plots.organizationId, org),
        eq(s.plots.farmId, own.farmId),
        isNull(s.plots.deletedAt),
        sql`${s.plots.id} <> ${plotId}`,
        lte(s.plots.minLon, box.maxLon),
        gte(s.plots.maxLon, box.minLon),
        lte(s.plots.minLat, box.maxLat),
        gte(s.plots.maxLat, box.minLat),
      ),
    )
    .limit(12);
  const found = checkPlots(
    [geometry, ...neighbors.map((n) => JSON.parse(n.geometry) as Area)],
    farm ? (JSON.parse(farm.geometry) as Area) : null,
    { maxExact: 12 },
  );
  return found
    .filter((w) => w.a === 0 || w.b === 0)
    .map((w) =>
      w.kind === "outside"
        ? { kind: "outside" as const, ratio: Math.round(w.ratio * 1000) / 1000 }
        : {
            kind: "overlap" as const,
            plotId: neighbors[(w.a === 0 ? w.b! : w.a) - 1]!.id,
            plotName: neighbors[(w.a === 0 ? w.b! : w.a) - 1]!.name,
            ratio: Math.round(w.ratio * 1000) / 1000,
          },
    );
}

export async function deletePlot(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  const ts = sdb.now();
  await updateSynced(
    sdb,
    s.plots,
    id,
    { deletedAt: ts },
    cascadeStmts(sdb, eq(s.plotAssignments.plotId, id), eq(s.tasks.plotId, id), ts),
  );
}

type PlotGeo = { geometry: string; minLon: number; minLat: number; maxLon: number; maxLat: number; areaHa: number };

/** Tolerancia entre la superficie original y la de las partes (el cliente corta en grados, el servidor mide geodésico). */
const AREA_TOLERANCE = 0.02;

/**
 * Reemplaza uno o dos lotes por lotes nuevos (dividir / unir, M-05). Los nuevos heredan tipo, cultivo, campaña,
 * siembra, pasto y color del primer lote original, y quienes tenían asignado un original reciben los nuevos.
 * Los originales se borran lógicamente con la misma cascada que deletePlot (asignaciones y tareas abiertas).
 * Los registros históricos quedan apuntando al lote original (ya borrado). Lecturas: 2. Un solo batch.
 */
async function replacePlots(
  sdb: ScopedDb,
  originalIds: string[],
  made: ({ name: string } & PlotGeo)[],
  expectedAreaHa: (originals: { areaHa: number }[]) => [number, number],
) {
  sdb.require(can.editField);
  const org = sdb.auth.orgId;
  const originals = await sdb.db
    .select()
    .from(s.plots)
    .where(and(eq(s.plots.organizationId, org), inArray(s.plots.id, originalIds), isNull(s.plots.deletedAt)));
  if (originals.length !== originalIds.length) throw new NotFoundError("No existe");
  if (new Set(originals.map((p) => p.farmId)).size !== 1) throw new HTTPException(400, { message: t("ui.plotsOtherFarm") });
  const [lo, hi] = expectedAreaHa(originals);
  const total = made.reduce((a, p) => a + p.areaHa, 0);
  if (total < lo * (1 - AREA_TOLERANCE) || total > hi * (1 + AREA_TOLERANCE))
    throw new HTTPException(400, { message: t("ui.plotsAreaMismatch") });
  const base = originals.find((p) => p.id === originalIds[0])!;
  const assigned = await sdb.db
    .select({ userId: s.plotAssignments.userId })
    .from(s.plotAssignments)
    .where(
      and(
        eq(s.plotAssignments.organizationId, org),
        inArray(s.plotAssignments.plotId, originalIds),
        isNull(s.plotAssignments.deletedAt),
      ),
    );
  const users = [...new Set(assigned.map((a) => a.userId))];
  const ts = sdb.now();
  const ids = made.map(() => newId());
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    ...made.map((p, i) =>
      sdb.db.insert(s.plots).values({
        ...p,
        id: ids[i]!,
        organizationId: org,
        farmId: base.farmId,
        kind: base.kind,
        crop: base.crop,
        season: base.season,
        sowingDate: base.sowingDate,
        pastureType: base.pastureType,
        color: base.color,
        createdAt: ts,
        updatedAt: ts,
        version: currentVersion,
      }),
    ),
    ...ids.flatMap((plotId) =>
      users.map((userId) =>
        sdb.db.insert(s.plotAssignments).values({
          id: newId(),
          organizationId: org,
          plotId,
          userId,
          createdAt: ts,
          updatedAt: ts,
          version: currentVersion,
        }),
      ),
    ),
    // Primero se suben las versiones de asignaciones y se borran las viejas, igual que al borrar un lote
    ...cascadeStmts(sdb, inArray(s.plotAssignments.plotId, originalIds), inArray(s.tasks.plotId, originalIds), ts),
    sdb.db
      .update(s.plots)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.plots.organizationId, org), inArray(s.plots.id, originalIds))),
    ...sdb.audit({
      action: originalIds.length === 1 ? "plot_split" : "plot_merge",
      entity: "plot",
      entityId: originalIds[0]!,
      detail: { from: originalIds, to: ids },
    }),
  ]);
  return { ids };
}

/** M-05: divide un lote en dos. La forma de las partes viene del cliente (packages/geo); acá solo se valida la superficie. */
export function splitPlot(sdb: ScopedDb, id: string, parts: ({ name: string } & PlotGeo)[]) {
  return replacePlots(sdb, [id], parts, ([o]) => [o!.areaHa, o!.areaHa]);
}

/** M-05: une dos lotes contiguos en uno (la superficie puede ser algo menor si se superponían). */
export function mergePlots(sdb: ScopedDb, ids: [string, string], merged: { name: string } & PlotGeo) {
  return replacePlots(sdb, ids, [merged], (os) => [Math.max(...os.map((o) => o.areaHa)), os[0]!.areaHa + os[1]!.areaHa]);
}

export async function deletePoi(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  await updateSynced(sdb, s.pointsOfInterest, id, { deletedAt: sdb.now() });
}
