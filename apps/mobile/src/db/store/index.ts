/**
 * Base local del celular (PRD §11): mismas tablas que D1 + outbox, cursores y archivos locales.
 * Implementa SyncStore para el motor de packages/sync. Esta clase es la fachada: cada dominio vive en su
 * módulo (records, tasks, farm, catalog, outbox, files, sync) como funciones que reciben la base.
 *
 * Reglas:
 * - Toda escritura del usuario va en una transacción junto con su mutación en el outbox.
 * - El pull nunca pisa una fila con mutaciones pendientes (lo local es más nuevo).
 * - El reset por cambio de asignaciones conserva lo pendiente.
 */
import { getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Polygon } from "geojson";
import type { Cursor, Mutation, PlotStock, Prescription, PullTable, RejectReason, WorkOrder } from "@yvy/shared";
import type { SyncStore } from "@yvy/sync";
import type { Sql } from "../sql";
import * as catalog from "./catalog";
import type { Alert, Animal, Farm, FarmLayer, LocalAudio, LocalPhoto, Machine, NewRecord, OutboxItem, Plot, PlotSeason, Poi, Product, RecordRow, Season, Task, Warehouse } from "./core";
import * as farm from "./farm";
import * as files from "./files";
import * as outbox from "./outbox";
import * as records from "./records";
import * as sync from "./sync";
import * as tasks from "./tasks";

export type { Farm, LocalAudio, LocalPhoto, NewRecord, OutboxItem, Plot, Poi, Product, Season } from "./core";

export class LocalDb implements SyncStore {
  constructor(
    readonly sql: Sql,
    readonly now: () => number = Date.now,
  ) {}

  /** Incremental: user_version guarda cuántas sentencias del esquema del servidor ya se aplicaron. */
  migrate(): void {
    return sync.migrate(this);
  }
  getKv(key: string): string | null {
    return sync.getKv(this, key);
  }
  setKv(key: string, value: string | null): void {
    return sync.setKv(this, key, value);
  }
  async pendingMutations(limit: number): Promise<Mutation[]> {
    return sync.pendingMutations(this, limit);
  }
  async removeMutations(ids: string[]): Promise<void> {
    return sync.removeMutations(this, ids);
  }
  async markRejected(rejections: { mutationId: string; reason: RejectReason; detail?: string }[]): Promise<void> {
    return sync.markRejected(this, rejections);
  }
  async getCursor(table: PullTable): Promise<Cursor | null> {
    return sync.getCursor(this, table);
  }
  async applyPull(table: PullTable, rows: Record<string, unknown>[], cursor: Cursor | null): Promise<void> {
    return sync.applyPull(this, table, rows, cursor);
  }
  async getAssignmentsVersion(): Promise<number | null> {
    return sync.getAssignmentsVersion(this);
  }
  async setAssignmentsVersion(v: number): Promise<void> {
    return sync.setAssignmentsVersion(this, v);
  }
  async resetTables(tables: readonly PullTable[]): Promise<void> {
    return sync.resetTables(this, tables);
  }
  /** Guarda un registro con sus fotos. Todo en una transacción con sus mutaciones. */
  saveRecord(userId: string, orgId: string, input: NewRecord, photos?: LocalPhoto[], recordId?: string, audio?: LocalAudio | null): string {
    return records.saveRecord(this, userId, orgId, input, photos, recordId, audio);
  }
  /**
   * Un registro por lote, todo en una transacción y con el mismo capturedAt (anotar en varios lotes, F-10).
   * Las fotos van en el primero: subirlas una vez por lote sería mandar lo mismo varias veces.
   */
  saveRecords(userId: string, orgId: string, inputs: NewRecord[], photos?: LocalPhoto[], audio?: LocalAudio | null): string[] {
    return records.saveRecords(this, userId, orgId, inputs, photos, audio);
  }
  /** Marca un punto de interés (F-07). Fila local + mutación en una sola transacción. */
  savePoi(orgId: string, input: { farmId: string; kind: Poi["kind"]; name: string; lon: number; lat: number }, poiId?: string): string {
    return farm.savePoi(this, orgId, input, poiId);
  }
  /**
   * Lote dibujado o editado en el celular (M-03, M-04). Fila local + mutación plots.upsert en una sola transacción.
   * Al editar solo cambian nombre, tipo, cultivo y forma: campaña, fecha de siembra y color quedan como estaban.
   */
  savePlot(orgId: string, input: { id?: string; farmId: string; name: string; kind: Plot["kind"]; crop: Plot["crop"]; geometry: Polygon }): string {
    return farm.savePlot(this, orgId, input);
  }
  /** T-08: comentarios de un registro (los de otras personas bajan con el sync). */
  commentsOf(recordId: string): { id: string; authorName: string; body: string; createdAt: number }[] {
    return records.commentsOf(this, recordId);
  }
  /** T-08: comentar sin señal. Las menciones se hacen desde la web (el celular no tiene la lista de personas). */
  addComment(userId: string, orgId: string, authorName: string, recordId: string, body: string): string {
    return records.addComment(this, userId, orgId, authorName, recordId, body);
  }
  deleteRecord(recordId: string): void {
    return records.deleteRecord(this, recordId);
  }
  /** Marca la tarea hecha y, si se repite, crea la siguiente con el mismo id que creará el servidor. */
  completeTask(taskId: string, recordId: string | null): void {
    return tasks.completeTask(this, taskId, recordId);
  }
  /** Todas las tareas (la base ya viene acotada a lo que la persona puede ver): pantallas de oficina. */
  allTasks(): Task[] {
    return tasks.allTasks(this);
  }
  taskById(id: string): Task | null {
    return tasks.taskById(this, id);
  }
  /** Tilda o destilda un ítem de la lista de verificación (F-15). Sin red: queda en el outbox. */
  setChecklistItem(taskId: string, itemId: string, done: boolean): void {
    return tasks.setTaskChecklistItem(this, taskId, itemId, done);
  }
  /** T-02: comenta una tarea. Se ve ya en el celular y viaja por el outbox. */
  addTaskComment(taskId: string, userId: string, authorName: string, text: string): void {
    return tasks.addTaskComment(this, taskId, userId, authorName, text);
  }
  pendingCount(): number {
    return outbox.pendingCount(this);
  }
  /**
   * Lo que falta mandar: mutaciones del outbox (cada registro con el peso de sus fotos) y fotos que
   * el servidor ya conoce pero todavía no se subieron. Más viejo primero.
   */
  outboxItems(): OutboxItem[] {
    return outbox.outboxItems(this);
  }
  rejected(): { mutationId: string; kind: string; reason: string; detail: string | null }[] {
    return outbox.rejected(this);
  }
  dismissRejected(mutationId: string): void {
    return outbox.dismissRejected(this, mutationId);
  }
  farms(): Farm[] {
    return farm.farms(this);
  }
  plots(farmId?: string): Plot[] {
    return farm.plots(this, farmId);
  }
  pois(farmId?: string): Poi[] {
    return farm.pois(this, farmId);
  }
  tasksToday(userId: string, today?: string): Task[] {
    return tasks.tasksToday(this, userId, today);
  }
  /** Tareas abiertas de todo el equipo (las que bajó el servidor para este rol), para el resumen de oficina. */
  openTasks(): Task[] {
    return tasks.openTasks(this);
  }
  /** Tareas abiertas con punto en el mapa (S-09), para dibujarlas y llevar a la persona ahí. */
  taskPoints(userId: string): { id: string; title: string; lon: number; lat: number }[] {
    return tasks.taskPoints(this, userId);
  }
  records(limit?: number): RecordRow[] {
    return records.records(this, limit);
  }
  /** Un registro por id (ficha); null si no existe o fue borrado. */
  recordById(id: string): RecordRow | null {
    return records.recordById(this, id);
  }
  /** Fotos del registro; `thumbUri` es null si la miniatura no está en este celular. */
  photosOfRecord(recordId: string): { id: string; thumbUri: string | null }[] {
    return records.photosOfRecord(this, recordId);
  }
  /** Nota de voz del registro (F-09): archivo local si está en este celular, y si ya se subió. */
  voiceOfRecord(recordId: string): { id: string; uri: string | null; uploaded: boolean }[] {
    return records.voiceOfRecord(this, recordId);
  }
  /** Primera miniatura local de cada registro con fotos (Historial). Las fotos de otro celular no tienen miniatura acá. */
  firstThumbByRecord(): Map<string, string> {
    return records.firstThumbByRecord(this);
  }
  /** F-17: hasta `max` miniaturas locales por registro, en el orden en que se sacaron (Historial). */
  thumbsByRecord(max?: number): Map<string, string[]> {
    return records.thumbsByRecord(this, max);
  }
  /** Últimas anotaciones de un lote (ficha del lote y pantalla Anotar). */
  recordsOfPlot(plotId: string, limit?: number): RecordRow[] {
    return records.recordsOfPlot(this, plotId, limit);
  }
  /**
   * Hacienda actual de un potrero, calculada con lo que hay en el celular (ADR 0004): último conteo más
   * movimientos y mortandad posteriores. Funciona sin señal. `null` si el potrero nunca tuvo datos de hacienda.
   */
  herdStock(plotId: string): PlotStock | null {
    return records.herdStock(this, plotId);
  }
  /** Lluvia del mes en curso según el pluviómetro (mm), para mostrar al terminar de anotar. */
  rainThisMonth(farmId: string, now?: number): number {
    return records.rainThisMonth(this, farmId, now);
  }
  /** Último NDVI del lote según lo que bajó al celular; null si no hay (empleados no reciben estadísticas). */
  lastVigor(plotId: string): { mean: number; acquiredAt: number } | null {
    return farm.lastVigor(this, plotId);
  }
  /** Las dos últimas pasadas de NDVI de cada lote, para ver cuáles empeoraron (F-29). */
  lastTwoVigorPasses(): { plotId: string; mean: number; acquiredAt: number }[] {
    return farm.lastTwoVigorPasses(this);
  }
  /** Tareas abiertas de un lote. */
  openTasksOfPlot(plotId: string): number {
    return tasks.openTasksOfPlot(this, plotId);
  }
  /** Tareas abiertas de un lote (ficha del lote, F-23), las que vencen antes primero. */
  openTasksListOfPlot(plotId: string, limit?: number): Task[] {
    return tasks.openTasksListOfPlot(this, plotId, limit);
  }
  /** Último registro por lote, para saber qué lotes hace días que nadie recorre. */
  lastVisitByPlot(): Map<string, number> {
    return records.lastVisitByPlot(this);
  }
  activeAlerts(): Alert[] {
    return farm.activeAlerts(this);
  }
  /** Receta de una tarea (A-11), ya validada; null si no tiene o está dañada. */
  prescriptionOf(taskId: string): Prescription | null {
    return tasks.prescriptionOf(this, taskId);
  }
  /** Orden de trabajo de una tarea (E-20), ya validada; null si no tiene o está dañada. */
  orderOf(taskId: string): WorkOrder | null {
    return tasks.orderOf(this, taskId);
  }
  /** Campañas activas de la organización, la más reciente primero. */
  activeSeasons(): Season[] {
    return catalog.activeSeasons(this);
  }
  /** Catálogo de productos de la organización. */
  products(): Product[] {
    return catalog.products(this);
  }
  /** Maquinaria y vehículos de la organización (para cargar combustible). */
  machines(): Machine[] {
    return catalog.machines(this);
  }
  /** Animales con caravana (G-21) de las estancias del celular; con `query`, los que tienen ese texto en la caravana. */
  animals(query?: string, limit?: number): Animal[] {
    return catalog.animals(this, query, limit);
  }
  /** Registros que llevan la caravana (pesadas, reproducción, sanidad), del más nuevo al más viejo; sin señal. */
  recordsOfTag(tag: string, limit?: number): RecordRow[] {
    return records.recordsOfTag(this, tag, limit);
  }
  /** Depósitos de la organización (para el recuento de inventario, E-15). */
  warehouses(): Warehouse[] {
    return catalog.warehouses(this);
  }
  /** Lo planificado en un lote para una campaña (cultivo, variedad), si bajó al celular. */
  plotSeason(plotId: string, seasonId: string): PlotSeason | null {
    return catalog.plotSeason(this, plotId, seasonId);
  }
  latestLayers(farmId: string): FarmLayer[] {
    return farm.latestLayers(this, farmId);
  }
  pendingUploads(): { attachmentId: string; photoUri: string; thumbUri: string; attempts: number; mime: string }[] {
    return files.pendingUploads(this);
  }
  markUploaded(attachmentId: string, ok: boolean): void {
    return files.markUploaded(this, attachmentId, ok);
  }
  /** F-18: fotos que ya no se reintentan solas por tantos fallos, con lo que pesan. */
  stuckUploads(maxAttempts: number): { n: number; bytes: number } {
    return files.stuckUploads(this, maxAttempts);
  }
  /** F-18: "Reintentar" las fotos trabadas: vuelven a contar desde cero. */
  retryStuckUploads(maxAttempts: number): void {
    return files.retryStuckUploads(this, maxAttempts);
  }
  /** Cuánto ocupa lo local que se puede medir sin tocar el disco (F-19): fotos y notas ya cargadas, mapas bajados. */
  storageSummary(): { photos: { n: number; bytes: number }; voice: { n: number; bytes: number }; maps: { n: number; bytes: number }; reclaimable: { n: number; bytes: number } } {
    return files.storageSummary(this);
  }
  /** Archivos grandes (foto completa o nota de voz) cuyo original ya está en el servidor: se pueden borrar del celular. */
  uploadedFiles(): { attachmentId: string; uri: string; bytes: number }[] {
    return files.uploadedFiles(this);
  }
  /** Después de borrar los archivos: la fila queda sin ruta (la miniatura se conserva) y se ve desde el servidor. */
  clearUploadedFiles(attachmentIds: string[]): void {
    return files.clearUploadedFiles(this, attachmentIds);
  }
  localPhoto(attachmentId: string): string | null {
    return files.localPhoto(this, attachmentId);
  }
  /** Cierra la sesión: borra todo lo local salvo lo que no se subió (no se pierde nada). */
  wipeSynced(): void {
    return sync.wipeSynced(this);
  }

  tableName(t: SQLiteTable): string {
    return getTableName(t);
  }
}
