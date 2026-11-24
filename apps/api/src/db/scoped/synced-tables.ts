/** Tablas sincronizables: organización, versión e id de cada una (para pull y alcance por estancia). */
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { PullTable } from "@yvy/shared";
import * as s from "@yvy/shared/schema";

interface SyncedTable {
  table: SQLiteTable;
  org: AnySQLiteColumn;
  version: AnySQLiteColumn;
  id: AnySQLiteColumn;
}

/** Columnas de organización, versión e id de cada tabla sincronizable. */
export const SYNCED: Record<PullTable, SyncedTable> = {
  farms: { table: s.farms, org: s.farms.organizationId, version: s.farms.version, id: s.farms.id },
  plots: { table: s.plots, org: s.plots.organizationId, version: s.plots.version, id: s.plots.id },
  points_of_interest: {
    table: s.pointsOfInterest,
    org: s.pointsOfInterest.organizationId,
    version: s.pointsOfInterest.version,
    id: s.pointsOfInterest.id,
  },
  plot_assignments: {
    table: s.plotAssignments,
    org: s.plotAssignments.organizationId,
    version: s.plotAssignments.version,
    id: s.plotAssignments.id,
  },
  tasks: { table: s.tasks, org: s.tasks.organizationId, version: s.tasks.version, id: s.tasks.id },
  records: { table: s.records, org: s.records.organizationId, version: s.records.version, id: s.records.id },
  attachments: {
    table: s.attachments,
    org: s.attachments.organizationId,
    version: s.attachments.version,
    id: s.attachments.id,
  },
  alerts: { table: s.alerts, org: s.alerts.organizationId, version: s.alerts.version, id: s.alerts.id },
  plot_index_stats: {
    table: s.plotIndexStats,
    org: s.plotIndexStats.organizationId,
    version: s.plotIndexStats.version,
    id: s.plotIndexStats.id,
  },
  farm_layers: {
    table: s.farmLayers,
    org: s.farmLayers.organizationId,
    version: s.farmLayers.version,
    id: s.farmLayers.id,
  },
  seasons: { table: s.seasons, org: s.seasons.organizationId, version: s.seasons.version, id: s.seasons.id },
  plot_seasons: {
    table: s.plotSeasons,
    org: s.plotSeasons.organizationId,
    version: s.plotSeasons.version,
    id: s.plotSeasons.id,
  },
  products: { table: s.products, org: s.products.organizationId, version: s.products.version, id: s.products.id },
  machines: { table: s.machines, org: s.machines.organizationId, version: s.machines.version, id: s.machines.id },
  animals: { table: s.animals, org: s.animals.organizationId, version: s.animals.version, id: s.animals.id },
  comments: { table: s.comments, org: s.comments.organizationId, version: s.comments.version, id: s.comments.id },
  warehouses: { table: s.warehouses, org: s.warehouses.organizationId, version: s.warehouses.version, id: s.warehouses.id },
};

/** Tabla Drizzle → nombre de tabla sincronizable (para aplicar el alcance por estancia al editar). */
export const SYNCED_KEYS = new Map<unknown, PullTable>(
  (Object.entries(SYNCED) as [PullTable, SyncedTable][]).map(([k, v]) => [v.table, k]),
);
