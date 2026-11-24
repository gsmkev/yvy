/** Inicio multi estancia y detalle de una estancia. */
import { and, asc, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { NotFoundError, type ScopedDb } from "../scoped";

// ---------- Inicio multi estancia ----------

type ImageryStatus = (typeof s.IMAGERY_STATUSES)[number];
/** Estado del primer procesamiento; las estancias anteriores al procesamiento con mapa base cuentan como listas. */
const IMAGERY_SQL = sql.raw(
  `COALESCE((SELECT status FROM farm_imagery fi WHERE fi.farm_id = farms.id), CASE WHEN EXISTS (SELECT 1 FROM farm_layers l WHERE l.farm_id = farms.id AND l.layer = 'true_color' AND l.deleted_at IS NULL) THEN 'ready' END)`,
);

/** Resumen de las estancias visibles para la persona. */
export async function farmSummaries(sdb: ScopedDb) {
  const org = sdb.auth.orgId;
  const now = sdb.now();
  return sdb.db
    .select({
      id: s.farms.id,
      name: s.farms.name,
      department: s.farms.department,
      timezone: s.farms.timezone,
      areaHa: s.farms.areaHa,
      geometry: s.farms.geometry,
      centroidLon: s.farms.centroidLon,
      centroidLat: s.farms.centroidLat,
      minLon: s.farms.minLon,
      minLat: s.farms.minLat,
      maxLon: s.farms.maxLon,
      maxLat: s.farms.maxLat,
      plots: sql<number>`(SELECT count(*) FROM plots p WHERE p.farm_id = farms.id AND p.deleted_at IS NULL)`,
      workers: sql<number>`(SELECT count(DISTINCT pa.user_id) FROM plot_assignments pa JOIN plots p ON p.id = pa.plot_id WHERE p.farm_id = farms.id AND pa.deleted_at IS NULL)`,
      activeAlerts: sql<number>`(SELECT count(*) FROM alerts a WHERE a.farm_id = farms.id AND a.resolved_at IS NULL AND (a.valid_to IS NULL OR a.valid_to >= ${now}))`,
      lastRecordAt: sql<
        number | null
      >`(SELECT max(captured_at) FROM records r WHERE r.farm_id = farms.id AND r.deleted_at IS NULL)`,
      basemapPath: sql<
        string | null
      >`(SELECT pmtiles_path FROM farm_layers l WHERE l.farm_id = farms.id AND l.layer = 'true_color' AND l.deleted_at IS NULL ORDER BY acquired_at DESC LIMIT 1)`,
      imageryStatus: sql<ImageryStatus | null>`${IMAGERY_SQL}`,
      records7d: sql<number>`(SELECT count(*) FROM records r WHERE r.farm_id = farms.id AND r.deleted_at IS NULL AND r.captured_at >= ${now - 7 * 86_400_000})`,
    })
    .from(s.farms)
    .where(and(eq(s.farms.organizationId, org), isNull(s.farms.deletedAt), sdb.workerFilter("farms")))
    .orderBy(asc(s.farms.name));
}

/** Subconsulta: columna de la pasada NDVI número `offset` (0 = la última) del lote de la fila. */
export const ndviAt = (col: "mean" | "acquired_at", offset: number) =>
  sql<
    number | null
  >`(SELECT ${sql.raw(col)} FROM plot_index_stats x WHERE x.plot_id = plots.id AND x.idx = 'ndvi' AND x.deleted_at IS NULL ORDER BY x.acquired_at DESC LIMIT 1 OFFSET ${sql.raw(String(offset))})`;

/**
 * Detalle de una estancia con sus lotes, puntos de interés, capas y asignaciones. Falla con NotFoundError si no es
 * visible.
 */
export async function farmDetail(sdb: ScopedDb, farmId: string) {
  const org = sdb.auth.orgId;
  const [farm] = await sdb.db
    .select()
    .from(s.farms)
    .where(
      and(
        eq(s.farms.id, farmId),
        eq(s.farms.organizationId, org),
        isNull(s.farms.deletedAt),
        sdb.workerFilter("farms"),
      ),
    )
    .limit(1);
  if (!farm) throw new NotFoundError("Estancia inexistente");
  const [[imagery], plots, pois, layers, assignments] = await Promise.all([
    sdb.db
      .select({
        status: sql<ImageryStatus | null>`${IMAGERY_SQL}`,
        requestedAt: sql<number | null>`(SELECT requested_at FROM farm_imagery fi WHERE fi.farm_id = farms.id)`,
      })
      .from(s.farms)
      .where(eq(s.farms.id, farmId))
      .limit(1),
    sdb.db
      .select({
        ...getTableColumns(s.plots),
        // Vigor: últimas dos pasadas de NDVI y última visita, en una sola consulta (subconsultas correlacionadas).
        ndviMean: ndviAt("mean", 0),
        ndviAt: ndviAt("acquired_at", 0),
        ndviPrevMean: ndviAt("mean", 1),
        ndviPrevAt: ndviAt("acquired_at", 1),
        lastRecordAt: sql<
          number | null
        >`(SELECT max(r.captured_at) FROM records r WHERE r.plot_id = plots.id AND r.deleted_at IS NULL)`,
      })
      .from(s.plots)
      .where(and(eq(s.plots.farmId, farmId), isNull(s.plots.deletedAt), sdb.workerFilter("plots")))
      .orderBy(asc(s.plots.name)),
    sdb.db
      .select({
        ...getTableColumns(s.pointsOfInterest),
        // Último nivel de agua registrado en la aguada o tajamar.
        lastWaterLevel: sql<
          string | null
        >`(SELECT json_extract(r.data, '$.level') FROM records r WHERE r.poi_id = points_of_interest.id AND r.kind = 'water' AND r.deleted_at IS NULL ORDER BY r.captured_at DESC LIMIT 1)`,
        lastWaterAt: sql<
          number | null
        >`(SELECT max(r.captured_at) FROM records r WHERE r.poi_id = points_of_interest.id AND r.kind = 'water' AND r.deleted_at IS NULL)`,
      })
      .from(s.pointsOfInterest)
      .where(and(eq(s.pointsOfInterest.farmId, farmId), isNull(s.pointsOfInterest.deletedAt))),
    sdb.db
      .select()
      .from(s.farmLayers)
      .where(and(eq(s.farmLayers.farmId, farmId), isNull(s.farmLayers.deletedAt)))
      .orderBy(desc(s.farmLayers.acquiredAt))
      .limit(20),
    sdb.isWorker
      ? Promise.resolve([])
      : sdb.db
          .select({ plotId: s.plotAssignments.plotId, userId: s.plotAssignments.userId })
          .from(s.plotAssignments)
          .innerJoin(s.plots, eq(s.plots.id, s.plotAssignments.plotId))
          .where(and(eq(s.plots.farmId, farmId), isNull(s.plotAssignments.deletedAt))),
  ]);
  return {
    farm,
    plots,
    pois,
    layers,
    assignments,
    imageryStatus: imagery?.status ?? null,
    imageryRequestedAt: imagery?.requestedAt ?? null,
  };
}
