/** Estancias, lotes y puntos de interés: alta y verificación de acceso. */
import { and, eq, isNull, sql } from "drizzle-orm";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "../client";
import { funnelEvent } from "../events";
import type { ScopedDb } from "./index";
import { ForbiddenError, NotFoundError, can } from "./permissions";

async function farmReadable(sdb: ScopedDb, farmId: string): Promise<boolean> {
  const [f] = await sdb.db
    .select({ id: s.farms.id })
    .from(s.farms)
    .where(
      and(
        eq(s.farms.id, farmId),
        eq(s.farms.organizationId, sdb.auth.orgId),
        isNull(s.farms.deletedAt),
        sdb.farmScopeSql("farms.id"),
      ),
    )
    .limit(1);
  return !!f;
}

/** Verifica que la estancia sea de la organización y devuelve su geometría (GeoJSON texto). */
export async function requireFarm(sdb: ScopedDb, farmId: string, write = false): Promise<string> {
  const [f] = await sdb.db
    .select({ id: s.farms.id, geometry: s.farms.geometry })
    .from(s.farms)
    .where(
      and(
        eq(s.farms.id, farmId),
        eq(s.farms.organizationId, sdb.auth.orgId),
        isNull(s.farms.deletedAt),
        // Fuera de las estancias permitidas (o solo lectura al escribir) se responde "inexistente"/prohibido.
        sdb.farmScopeSql("farms.id", write),
      ),
    )
    .limit(1);
  if (!f) {
    if (write && (await farmReadable(sdb, farmId)))
      throw new ForbiddenError("Tenés acceso de solo lectura a esta estancia");
    throw new NotFoundError("Estancia inexistente");
  }
  return f.geometry;
}

/** La estancia existe en la organización y, si es empleado, tiene lotes asignados en ella. */
export async function requireFarmVisible(sdb: ScopedDb, farmId: string): Promise<void> {
  const [f] = await sdb.db
    .select({ id: s.farms.id })
    .from(s.farms)
    .where(
      and(
        eq(s.farms.id, farmId),
        eq(s.farms.organizationId, sdb.auth.orgId),
        isNull(s.farms.deletedAt),
        sdb.workerFilter("farms"),
      ),
    )
    .limit(1);
  if (!f) throw new NotFoundError("Estancia inexistente");
}

/** Crea una estancia dentro del límite de hectáreas del plan. */
export async function createFarm(sdb: ScopedDb, 
  input: Omit<typeof s.farms.$inferInsert, "id" | "organizationId" | "createdAt" | "updatedAt" | "version">,
) {
  sdb.require(can.editField);
  if (await sdb.isFarmRestricted()) throw new ForbiddenError("Con acceso limitado a ciertas estancias no podés crear otras");
  await sdb.requireHaRoom(input.areaHa);
  const id = newId();
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.farms).values({
      ...input,
      id,
      organizationId: sdb.auth.orgId,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
    sdb.db.insert(s.farmImagery).values({ farmId: id, status: "pending", requestedAt: ts, updatedAt: ts }),
    funnelEvent(sdb.db, "farm_created", sdb.auth.orgId, ts),
    ...sdb.audit({ action: "farm_create", entity: "farm", entityId: id, detail: { name: input.name, areaHa: input.areaHa } }),
  ]);
  return { id };
}

/** Lotes vivos de una estancia de la organización (1 query). */
export async function countPlots(sdb: ScopedDb, farmId: string): Promise<number> {
  const [r] = await sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.plots)
    .where(and(eq(s.plots.farmId, farmId), eq(s.plots.organizationId, sdb.auth.orgId), isNull(s.plots.deletedAt)));
  return Number(r?.n ?? 0);
}

/** Alta de varios lotes de una vez (importación KML). */
export async function createPlots(sdb: ScopedDb, 
  farmId: string,
  items: Omit<
    typeof s.plots.$inferInsert,
    "id" | "organizationId" | "farmId" | "createdAt" | "updatedAt" | "version"
  >[],
): Promise<{ ids: string[]; farmGeometry: string }> {
  sdb.require(can.editField);
  const farmGeometry = await sdb.requireFarm(farmId, true);
  await sdb.requireHaRoom(
    items.reduce((a, p) => a + (p.areaHa ?? 0), 0),
    "plots",
  );
  const ts = sdb.now();
  const ids = items.map(() => newId());
  // Una sentencia por lote: las geometrías son largas y no conviene agruparlas.
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    ...items.map((p, i) =>
      sdb.db.insert(s.plots).values({
        ...p,
        id: ids[i]!,
        organizationId: sdb.auth.orgId,
        farmId,
        createdAt: ts,
        updatedAt: ts,
        version: currentVersion,
      }),
    ),
    funnelEvent(sdb.db, "plots_created", sdb.auth.orgId, ts),
    ...sdb.audit({ action: "plot_create", entity: "plot", entityId: ids[0] ?? null, detail: { farmId, count: ids.length } }),
  ]);
  return { ids, farmGeometry };
}

/** Crea un punto de interés en una estancia. */
export async function createPoi(sdb: ScopedDb, input: {
  farmId: string;
  kind: (typeof s.POI_KINDS)[number];
  name: string;
  lon: number;
  lat: number;
}) {
  sdb.require(can.editField);
  await sdb.requireFarm(input.farmId, true);
  const id = newId();
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.pointsOfInterest).values({
      ...input,
      id,
      organizationId: sdb.auth.orgId,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
    ...sdb.audit({ action: "poi_create", entity: "poi", entityId: id, detail: { farmId: input.farmId, name: input.name } }),
  ]);
  return { id };
}
