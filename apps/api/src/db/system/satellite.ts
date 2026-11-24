/** Escritura de lo que calcula workers-py sobre imágenes: escenas, índices, capas, áreas problema, zonas, EUDR y análisis. */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { LIMITS, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, chunkForParams, currentVersion, runBatch, type Stmt } from "../client";
import type { SystemDb } from "./index";

/** Registra la escena. `processed` indica si ya se cargaron sus estadísticas. */
export async function upsertScene(sys: SystemDb, x: {
  source: string;
  itemId: string;
  acquiredAt: number;
  cloudPct: number | null;
}): Promise<{ id: string; processed: boolean }> {
  const [row] = await sys.db
    .insert(s.scenes)
    .values({ id: newId(), ...x })
    .onConflictDoUpdate({ target: [s.scenes.source, s.scenes.itemId], set: { cloudPct: sql`excluded.cloud_pct` } })
    .returning({ id: s.scenes.id, processedAt: s.scenes.processedAt });
  return { id: row!.id, processed: row!.processedAt !== null };
}

export async function markSceneProcessed(sys: SystemDb, id: string): Promise<void> {
  await sys.db.update(s.scenes).set({ processedAt: Date.now() }).where(eq(s.scenes.id, id));
}

export async function upsertIndexStats(sys: SystemDb, 
  rows: {
    plotId: string;
    sceneId: string;
    acquiredAt: number;
    idx: string;
    mean: number;
    p10: number;
    p90: number;
    validPct: number;
    lowConfidence?: boolean;
  }[],
): Promise<{ written: number; unknownPlots: string[] }> {
  const plots = await sys.db
    .select({ id: s.plots.id, org: s.plots.organizationId })
    .from(s.plots)
    .where(inArray(s.plots.id, [...new Set(rows.map((r) => r.plotId))]));
  const orgOf = new Map(plots.map((p) => [p.id, p.org]));
  const ts = Date.now();
  const valid = rows.filter((r) => orgOf.has(r.plotId));
  const stmts: Stmt[] = [bumpVersion(sys.db)];
  for (const chunk of chunkForParams(valid, 15)) {
    stmts.push(
      sys.db
        .insert(s.plotIndexStats)
        .values(
          chunk.map((r) => ({
            ...r,
            id: newId(),
            organizationId: orgOf.get(r.plotId)!,
            createdAt: ts,
            updatedAt: ts,
            version: currentVersion,
          })),
        )
        .onConflictDoUpdate({
          target: [s.plotIndexStats.plotId, s.plotIndexStats.sceneId, s.plotIndexStats.idx],
          set: {
            mean: sql`excluded.mean`,
            p10: sql`excluded.p10`,
            p90: sql`excluded.p90`,
            validPct: sql`excluded.valid_pct`,
            lowConfidence: sql`excluded.low_confidence`,
            updatedAt: ts,
            version: currentVersion,
          },
        }),
    );
  }
  if (valid.length) await runBatch(sys.db, stmts);
  return { written: valid.length, unknownPlots: rows.filter((r) => !orgOf.has(r.plotId)).map((r) => r.plotId) };
}

export async function addFarmLayer(sys: SystemDb, x: {
  farmId: string;
  layer: (typeof s.LAYERS)[number];
  acquiredAt: number;
  pmtilesPath: string;
  bytes: number;
  bounds: string;
}) {
  const [farm] = await sys.db
    .select({ org: s.farms.organizationId })
    .from(s.farms)
    .where(eq(s.farms.id, x.farmId))
    .limit(1);
  if (!farm) return null;
  const id = newId();
  const ts = Date.now();
  await runBatch(sys.db, [
    bumpVersion(sys.db),
    sys.db
      .insert(s.farmLayers)
      .values({ ...x, id, organizationId: farm.org, createdAt: ts, updatedAt: ts, version: currentVersion }),
    sys.db
      .update(s.farms)
      .set({ offlinePackVersion: sql`${s.farms.offlinePackVersion} + 1`, updatedAt: ts, version: currentVersion })
      .where(eq(s.farms.id, x.farmId)),
    // El mapa base marca el fin del primer procesamiento (S-02)
    ...(x.layer === "true_color" ? [imageryUpsert(sys, x.farmId, "ready", ts)] : []),
  ]);
  return { id };
}

/**
 * Retención en R2: marca borradas las versiones de una capa que pasan el tope de LIMITS.storage.layerRetention
 * (las más viejas) y devuelve sus rutas para borrar los archivos. El borrado lógico viaja por sync al celular.
 */
export async function pruneFarmLayers(sys: SystemDb, farmId: string, layer: (typeof s.LAYERS)[number]): Promise<string[]> {
  const r = LIMITS.storage.layerRetention;
  const keep = layer.startsWith("fert_") ? r.fert : r[layer as keyof typeof r];
  const old = await sys.db
    .select({ id: s.farmLayers.id, path: s.farmLayers.pmtilesPath })
    .from(s.farmLayers)
    .where(and(eq(s.farmLayers.farmId, farmId), eq(s.farmLayers.layer, layer), isNull(s.farmLayers.deletedAt)))
    .orderBy(desc(s.farmLayers.acquiredAt), desc(s.farmLayers.id))
    .limit(50)
    .offset(keep);
  if (!old.length) return [];
  const ts = Date.now();
  await runBatch(sys.db, [
    bumpVersion(sys.db),
    ...chunkForParams(old.map((o) => o.id), 1).map((ids) =>
      sys.db
        .update(s.farmLayers)
        .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
        .where(inArray(s.farmLayers.id, ids)),
    ),
  ]);
  return old.map((o) => o.path);
}

/** M-17: GeoTIFF de una estancia esperando su conversión a PNG georreferenciado. */
export function pendingCustomLayers(sys: SystemDb, farmId: string) {
  return sys.db
    .select({ id: s.customLayers.id, originalPath: s.customLayers.originalPath, mime: s.customLayers.mime })
    .from(s.customLayers)
    .where(
      and(
        eq(s.customLayers.farmId, farmId),
        eq(s.customLayers.status, "processing"),
        isNull(s.customLayers.deletedAt),
      ),
    );
}

/** M-17: resultado de la conversión. Devuelve false si la capa no existe, ya no está pendiente o la ruta no es suya. */
export async function finishCustomLayer(sys: SystemDb, 
  id: string,
  r:
    | { status: "failed" }
    | { status: "ready"; imagePath: string; imageMime: string; bytes: number; corners: [number, number][] },
): Promise<boolean> {
  const [row] = await sys.db
    .select({ org: s.customLayers.organizationId })
    .from(s.customLayers)
    .where(and(eq(s.customLayers.id, id), eq(s.customLayers.status, "processing"), isNull(s.customLayers.deletedAt)))
    .limit(1);
  if (!row) return false;
  if (r.status === "ready" && !r.imagePath.startsWith(`layers/${row.org}/${id}/`)) return false;
  const ts = Date.now();
  await runBatch(sys.db, [
    bumpVersion(sys.db),
    sys.db
      .update(s.customLayers)
      .set(
        r.status === "failed"
          ? { status: "failed", updatedAt: ts, version: currentVersion }
          : {
              status: "ready",
              imagePath: r.imagePath,
              imageMime: r.imageMime,
              bytes: r.bytes,
              corners: JSON.stringify(r.corners),
              updatedAt: ts,
              version: currentVersion,
            },
      )
      .where(eq(s.customLayers.id, id)),
  ]);
  return true;
}

function imageryUpsert(sys: SystemDb, farmId: string, status: (typeof s.IMAGERY_STATUSES)[number], ts: number) {
  return sys.db
    .insert(s.farmImagery)
    .values({ farmId, status, requestedAt: ts, updatedAt: ts })
    .onConflictDoUpdate({ target: s.farmImagery.farmId, set: { status, updatedAt: ts } });
}

/** Estado del procesamiento satelital inicial. Devuelve false si la estancia no existe. */
export async function setImageryStatus(sys: SystemDb, farmId: string, status: (typeof s.IMAGERY_STATUSES)[number]): Promise<boolean> {
  const [farm] = await sys.db.select({ id: s.farms.id }).from(s.farms).where(eq(s.farms.id, farmId)).limit(1);
  if (!farm) return false;
  await imageryUpsert(sys, farmId, status, Date.now());
  return true;
}

/** S-03: el job de historia avisa que terminó (done) o falló. */
export async function setHistoryStatus(sys: SystemDb, farmId: string, status: "done" | "failed"): Promise<boolean> {
  const res = await sys.db
    .update(s.farmHistory)
    .set({ status, updatedAt: Date.now() })
    .where(eq(s.farmHistory.farmId, farmId))
    .returning({ id: s.farmHistory.farmId });
  return res.length > 0;
}

/**
 * S-08: reemplaza las áreas problema de un lote por las de la escena `acquiredAt` (lista vacía = las limpia).
 * Si ya hay áreas de una escena más nueva, no pisa nada. La organización sale del lote, no del request.
 */
export async function replaceProblemAreas(sys: SystemDb, 
  plotId: string,
  acquiredAt: number,
  areas: Omit<typeof s.problemAreas.$inferInsert, "id" | "organizationId" | "farmId" | "plotId" | "acquiredAt" | "createdAt">[],
): Promise<number | null> {
  const [plot] = await sys.db
    .select({ org: s.plots.organizationId, farmId: s.plots.farmId })
    .from(s.plots)
    .where(and(eq(s.plots.id, plotId), isNull(s.plots.deletedAt)))
    .limit(1);
  if (!plot) return null;
  const [newer] = await sys.db
    .select({ n: sql<number>`count(*)` })
    .from(s.problemAreas)
    .where(and(eq(s.problemAreas.plotId, plotId), gte(s.problemAreas.acquiredAt, acquiredAt + 1)));
  if (newer && newer.n > 0) return 0;
  const ts = Date.now();
  await runBatch(sys.db, [
    sys.db.delete(s.problemAreas).where(eq(s.problemAreas.plotId, plotId)),
    ...areas.map((a) =>
      sys.db.insert(s.problemAreas).values({
        ...a,
        id: newId(),
        organizationId: plot.org,
        farmId: plot.farmId,
        plotId,
        acquiredAt,
        createdAt: ts,
      }),
    ),
  ]);
  return areas.length;
}

/** C-10: guarda (reemplaza) el informe de riesgo de la estancia. */
/** A-32: reemplaza las zonas de manejo de un lote. La organización y la estancia salen del lote, no del request. */
export async function replaceManagementZones(sys: SystemDb, 
  plotId: string,
  seasons: number[],
  zones: { zone: number; areaHa: number; pct: number; meanNdvi: number; geometry: string }[],
): Promise<number | null> {
  const [plot] = await sys.db
    .select({ org: s.plots.organizationId, farmId: s.plots.farmId })
    .from(s.plots)
    .where(and(eq(s.plots.id, plotId), isNull(s.plots.deletedAt)))
    .limit(1);
  if (!plot) return null;
  const ts = Date.now();
  await runBatch(sys.db, [
    sys.db.delete(s.managementZones).where(eq(s.managementZones.plotId, plotId)),
    ...chunkForParams(zones, 11).map((chunk) =>
      sys.db.insert(s.managementZones).values(
        chunk.map((z) => ({
          ...z,
          id: newId(),
          organizationId: plot.org,
          farmId: plot.farmId,
          plotId,
          seasons: JSON.stringify(seasons),
          computedAt: ts,
        })),
      ),
    ),
  ]);
  return zones.length;
}

/** S-30: guarda (reemplaza) el indicador EUDR de un lote. La organización sale del lote, no del request. */
export async function upsertEudrResult(sys: SystemDb, 
  plotId: string,
  r: Omit<typeof s.eudrResults.$inferInsert, "id" | "organizationId" | "farmId" | "plotId" | "computedAt">,
): Promise<boolean> {
  const [plot] = await sys.db
    .select({ org: s.plots.organizationId, farmId: s.plots.farmId })
    .from(s.plots)
    .where(and(eq(s.plots.id, plotId), isNull(s.plots.deletedAt)))
    .limit(1);
  if (!plot) return false;
  const row = { ...r, organizationId: plot.org, farmId: plot.farmId, plotId, computedAt: Date.now() };
  const { plotId: _p, ...set } = row;
  await sys.db
    .insert(s.eudrResults)
    .values({ ...row, id: newId() })
    .onConflictDoUpdate({ target: s.eudrResults.plotId, set });
  return true;
}

/** S-20 y S-31: guarda (reemplaza) el análisis de un lote. La organización sale del lote, no del request. */
export async function upsertAnalysis(sys: SystemDb, 
  plotId: string,
  r: Pick<typeof s.plotAnalyses.$inferInsert, "kind" | "refKey" | "fromAt" | "toAt" | "plotAreaHa" | "validPct" | "metrics" | "changes">,
): Promise<boolean> {
  const [plot] = await sys.db
    .select({ org: s.plots.organizationId, farmId: s.plots.farmId })
    .from(s.plots)
    .where(and(eq(s.plots.id, plotId), isNull(s.plots.deletedAt)))
    .limit(1);
  if (!plot) return false;
  const row = { ...r, organizationId: plot.org, farmId: plot.farmId, plotId, computedAt: Date.now() };
  const { plotId: _p, kind: _k, refKey: _r, ...set } = row;
  await sys.db
    .insert(s.plotAnalyses)
    .values({ ...row, id: newId() })
    .onConflictDoUpdate({ target: [s.plotAnalyses.plotId, s.plotAnalyses.kind, s.plotAnalyses.refKey], set });
  return true;
}

/** S-31: el job termina (o falla); solo cambia el estado de un pedido existente. */
export async function setAnalysisStatus(sys: SystemDb, farmId: string, kind: s.AnalysisKind, status: "done" | "failed"): Promise<boolean> {
  const res = await sys.db
    .update(s.analysisJobs)
    .set({ status, updatedAt: Date.now() })
    .where(and(eq(s.analysisJobs.farmId, farmId), eq(s.analysisJobs.kind, kind)))
    .returning({ id: s.analysisJobs.farmId });
  return res.length > 0;
}
