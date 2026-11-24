import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { RECURRENCES, TASK_STATUS, TASK_PRIORITIES, RECORD_KINDS, UPLOAD_STATUS } from "./enums";
import { timestamps, synced } from "./columns";

// ---------- Trabajo ----------

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id"),
    assigneeId: text("assignee_id").notNull(),
    title: text("title").notNull(),
    /** Tipo de registro que abre al completarla (ej. "rain"), o null. */
    kind: text("kind", { enum: RECORD_KINDS }),
    dueDate: text("due_date").notNull(),
    /** Hora límite "HH:MM" (hora de la estancia), o null si basta con el día. */
    dueTime: text("due_time"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("normal"),
    /** JSON: comentarios de la tarea (ver taskCommentSchema). Se agregan por la API (web) o por la mutación tasks.comment (celular, sin señal). */
    comments: text("comments").notNull().default("[]"),
    recurrence: text("recurrence", { enum: RECURRENCES }).notNull().default("none"),
    status: text("status", { enum: TASK_STATUS }).notNull().default("open"),
    completedAt: integer("completed_at"),
    completedBy: text("completed_by"),
    recordId: text("record_id"),
    /** Punto al que ir (S-09: centro de un área problema). El celular lo muestra en el mapa y en "Llevame ahí". */
    lon: real("lon"),
    lat: real("lat"),
    /** Receta agronómica (JSON, ver prescriptionSchema): al hacer la tarea, la aplicación sale precargada. */
    prescription: text("prescription"),
    createdBy: text("created_by").notNull(),
    /** Lista de verificación (F-15): JSON `[{id, text, done}]` o null. Ver checklist.ts. */
    checklist: text("checklist"),
    /** Orden de trabajo (JSON, ver orderSchema): labor, insumos, máquina y contratista. Baja al celular (E-20). */
    workOrder: text("work_order"),
    ...synced,
  },
  (t) => [
    index("tasks_sync_idx").on(t.organizationId, t.version, t.id),
    index("tasks_assignee_idx").on(t.assigneeId, t.dueDate),
  ],
);

/** Stock mínimo por producto y depósito (E-14). Tabla de oficina: no se sincroniza. */
export const stockMinimums = sqliteTable(
  "stock_minimums",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    productId: text("product_id").notNull(),
    warehouseId: text("warehouse_id").notNull(),
    /** En la unidad base del producto (l o kg). */
    minQty: real("min_qty").notNull(),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("stock_minimums_uq").on(t.organizationId, t.productId, t.warehouseId)],
);

export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id"),
    poiId: text("poi_id"),
    authorId: text("author_id").notNull(),
    kind: text("kind", { enum: RECORD_KINDS }).notNull(),
    /** JSON validado con el esquema Zod del tipo (packages/shared/src/records.ts). */
    data: text("data").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    lon: real("lon"),
    lat: real("lat"),
    gpsAccuracyM: real("gps_accuracy_m"),
    /** Hora del dispositivo. */
    capturedAt: integer("captured_at").notNull(),
    deviceId: text("device_id"),
    ...synced,
  },
  (t) => [
    index("records_sync_idx").on(t.organizationId, t.version, t.id),
    index("records_farm_captured_idx").on(t.farmId, t.capturedAt),
    index("records_plot_idx").on(t.plotId),
  ],
);

/**
 * T-08: comentarios sobre un registro, con menciones (`@Ramón mirá esto`). Se sincroniza; cada comentario es una fila
 * propia (a diferencia de los de las tareas, que van en un JSON) para que dos personas comentando offline no se pisen.
 */
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    recordId: text("record_id").notNull(),
    authorId: text("author_id").notNull(),
    /** Nombre del autor al comentar (el celular no tiene la tabla de usuarios). */
    authorName: text("author_name").notNull().default(""),
    body: text("body").notNull(),
    /** JSON: ids de usuario mencionados (miembros de la organización). */
    mentions: text("mentions").notNull().default("[]"),
    ...synced,
  },
  (t) => [
    index("comments_sync_idx").on(t.organizationId, t.version, t.id),
    index("comments_record_idx").on(t.recordId, t.createdAt),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    recordId: text("record_id").notNull(),
    storagePath: text("storage_path").notNull(),
    thumbPath: text("thumb_path").notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    uploadStatus: text("upload_status", { enum: UPLOAD_STATUS }).notNull().default("pending"),
    ...synced,
  },
  (t) => [
    index("attachments_sync_idx").on(t.organizationId, t.version, t.id),
    index("attachments_record_idx").on(t.recordId),
  ],
);
