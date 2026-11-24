/** Tipos, tablas y ayudas que comparten los repositorios de la base local. */
import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Mutation, PullTable, RecordKind } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { Sql } from "../sql";

/** Lo que necesita cada repositorio de la base: el acceso SQL y el reloj. */
export interface Ctx {
  readonly sql: Sql;
  readonly now: () => number;
}

/** Encola una mutación en el outbox (siempre dentro de la transacción de la escritura). */
export function enqueue(db: Ctx, m: Mutation, rowId: string): void {
  db.sql.run("INSERT INTO outbox (mutation_id, kind, row_id, payload, created_at) VALUES (?, ?, ?, ?, ?)", [
    m.mutationId,
    m.kind,
    rowId,
    JSON.stringify(m),
    db.now(),
  ]);
}

/** Tabla Drizzle de cada tabla sincronizable. */
export const TABLES: Record<PullTable, SQLiteTable> = {
  farms: s.farms,
  plots: s.plots,
  points_of_interest: s.pointsOfInterest,
  plot_assignments: s.plotAssignments,
  tasks: s.tasks,
  records: s.records,
  attachments: s.attachments,
  alerts: s.alerts,
  plot_index_stats: s.plotIndexStats,
  farm_layers: s.farmLayers,
  seasons: s.seasons,
  plot_seasons: s.plotSeasons,
  products: s.products,
  machines: s.machines,
  animals: s.animals,
  comments: s.comments,
  warehouses: s.warehouses,
};

/** jsKey → columna SQL, sacado del esquema compartido. */
const columnsOf = (t: SQLiteTable) => Object.entries(getTableColumns(t)).map(([key, col]) => ({ key, name: col.name }));
/** Columnas de cada tabla sincronizable. */
export const COLS = Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [k, columnsOf(t)])) as Record<
  PullTable,
  { key: string; name: string }[]
>;

/** Fila SQL (snake_case) → objeto (camelCase) según el esquema. */
export function fromRow<T>(table: SQLiteTable, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const { key, name } of columnsOf(table)) out[key] = row[name];
  return out as T;
}

/** Fila de una estancia. */
export type Farm = typeof s.farms.$inferSelect;
/** Fila de un lote. */
export type Plot = typeof s.plots.$inferSelect;
/** Fila de un punto de interés. */
export type Poi = typeof s.pointsOfInterest.$inferSelect;
/** Fila de una tarea. */
export type Task = typeof s.tasks.$inferSelect;
/** Fila de un registro; `pending` indica si todavía no salió. */
export type RecordRow = typeof s.records.$inferSelect & { pending: boolean; rejected: string | null; photos: number; voice: number };
/** Fila de un aviso. */
export type Alert = typeof s.alerts.$inferSelect;
/** Fila de una capa de imagen de una estancia. */
export type FarmLayer = typeof s.farmLayers.$inferSelect;
/** Fila de una campaña. */
export type Season = typeof s.seasons.$inferSelect;
/** Fila de un producto. */
export type Product = typeof s.products.$inferSelect;
/** Fila de una máquina. */
export type Machine = typeof s.machines.$inferSelect;
/** Fila de un animal. */
export type Animal = typeof s.animals.$inferSelect;
/** Fila de un depósito. */
export type Warehouse = typeof s.warehouses.$inferSelect;
/** Fila del plan de un lote en una campaña. */
export type PlotSeason = typeof s.plotSeasons.$inferSelect;

/** Datos de un registro nuevo antes de guardarlo. */
export interface NewRecord {
  farmId: string;
  plotId: string | null;
  poiId: string | null;
  kind: RecordKind;
  data: Record<string, unknown>;
  lon: number | null;
  lat: number | null;
  gpsAccuracyM: number | null;
  capturedAt: number;
}

/** Nota de voz grabada en el celular: un .m4a local, sin miniatura. */
export interface LocalAudio {
  uri: string;
  bytes: number;
}

/** Foto sacada en el celular: archivo, miniatura y medidas. */
export interface LocalPhoto {
  photoUri: string;
  thumbUri: string;
  width: number;
  height: number;
  bytes: number;
}

/** Una cosa pendiente de mandar, tal como la ve la persona (pantalla Más). */
export interface OutboxItem {
  id: string;
  /** Qué es: un registro nuevo o editado, un borrado, una tarea hecha, o solo fotos. */
  what: "record" | "record_delete" | "task" | "photos" | "poi" | "plot";
  recordKind: RecordKind | null;
  plotId: string | null;
  at: number;
  photos: number;
  photoBytes: number;
}

