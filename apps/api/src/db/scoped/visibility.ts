/**
 * Visibilidad por tabla sincronizable: lotes asignados (roles de campo) o estancias permitidas (supervisor, K-05).
 * Dos tablas de reglas: `WORKER_RULES` para empleado y contratista, `SCOPE_RULES` para el resto de los roles.
 * `undefined` = sin límite más allá de la organización.
 */
import { sql, type SQL } from "drizzle-orm";
import type { PullTable } from "@yvy/shared";
import type { ScopedDb } from "./index";

/** Registros (o filas con `record_id`) que ve un rol de campo, para filtrar adjuntos y comentarios. */
const viaVisibleRecords = (sdb: ScopedDb, col: string) =>
  sql`${sql.raw(col)} IN (SELECT id FROM records WHERE organization_id = ${sdb.auth.orgId} AND ${sdb.recordsVisibleSql()})`;

type WorkerRule = (sdb: ScopedDb) => SQL | undefined;

const WORKER_RULES: Record<PullTable, WorkerRule> = {
  farms: (sdb) => sql`farms.id IN ${sdb.workerFarmsSql()}`,
  plots: (sdb) => sql`plots.id IN ${sdb.assignedPlotsSql()}`,
  points_of_interest: (sdb) => sql`points_of_interest.farm_id IN ${sdb.workerFarmsSql()}`,
  plot_assignments: (sdb) => sql`plot_assignments.user_id = ${sdb.auth.userId}`,
  tasks: (sdb) => sql`tasks.assignee_id = ${sdb.auth.userId}`,
  records: (sdb) => sdb.recordsVisibleSql(),
  attachments: (sdb) => viaVisibleRecords(sdb, "attachments.record_id"),
  alerts: (sdb) => sql`alerts.id IN (SELECT alert_id FROM alert_plots WHERE plot_id IN ${sdb.assignedPlotsSql()})`,
  plot_index_stats: () => sql`0`, // PRD §11: no baja al empleado
  farm_layers: (sdb) => sql`farm_layers.farm_id IN ${sdb.workerFarmsSql()}`,
  // las campañas son de toda la organización: el empleado las necesita para anotar; el contratista no
  seasons: (sdb) => (sdb.isContractor ? sql`0` : undefined),
  plot_seasons: (sdb) => sql`plot_seasons.plot_id IN ${sdb.assignedPlotsSql()}`,
  products: (sdb) => (sdb.isContractor ? sql`0` : undefined), // el catálogo es de toda la organización
  machines: () => undefined, // las máquinas son de toda la organización: el empleado las elige al cargar combustible
  animals: (sdb) => sql`animals.farm_id IN ${sdb.workerFarmsSql()}`,
  comments: (sdb) => viaVisibleRecords(sdb, "comments.record_id"),
  warehouses: () => sql`0`, // los depósitos son para el recuento (E-15): el empleado no entra al ERP
};

/** Tabla con la estancia en una columna propia, o a través de lotes o de registros. */
type ScopeRule = (sdb: ScopedDb, write: boolean) => SQL | undefined;
const byFarm =
  (col: string): ScopeRule =>
  (sdb, write) =>
    sdb.farmScopeSql(col, write);
const viaPlots =
  (col: string): ScopeRule =>
  (sdb, write) => {
    const f = sdb.farmScopeSql("plots.farm_id", write);
    return f ? sql`${sql.raw(col)} IN (SELECT id FROM plots WHERE ${f})` : undefined;
  };
const viaRecords =
  (col: string): ScopeRule =>
  (sdb, write) => {
    const f = sdb.farmScopeSql("records.farm_id", write);
    return f ? sql`${sql.raw(col)} IN (SELECT id FROM records WHERE ${f})` : undefined;
  };

const SCOPE_RULES: Record<PullTable, ScopeRule> = {
  farms: byFarm("farms.id"),
  plots: byFarm("plots.farm_id"),
  points_of_interest: byFarm("points_of_interest.farm_id"),
  plot_assignments: viaPlots("plot_assignments.plot_id"),
  tasks: byFarm("tasks.farm_id"),
  records: byFarm("records.farm_id"),
  attachments: viaRecords("attachments.record_id"),
  alerts: byFarm("alerts.farm_id"),
  plot_index_stats: viaPlots("plot_index_stats.plot_id"),
  farm_layers: byFarm("farm_layers.farm_id"),
  plot_seasons: viaPlots("plot_seasons.plot_id"),
  animals: byFarm("animals.farm_id"),
  comments: viaRecords("comments.record_id"),
  seasons: () => undefined,
  products: () => undefined,
  machines: () => undefined,
  warehouses: (sdb) => (sdb.auth.role === "supervisor" ? sql`0` : undefined), // el supervisor tampoco entra al ERP (E-15)
};

/** Condición de visibilidad por tabla: lotes asignados (roles de campo) o estancias permitidas (supervisor, K-05). */
export function workerFilter(sdb: ScopedDb, table: PullTable, write = false): SQL | undefined {
  return sdb.isWorker ? WORKER_RULES[table](sdb) : SCOPE_RULES[table](sdb, write);
}
