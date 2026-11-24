/** Registro de mutaciones aplicadas, para que reintentar un push sea idempotente. */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ---------- Sincronización ----------

/** Idempotencia del push. */
export const syncMutations = sqliteTable("sync_mutations", {
  mutationId: text("mutation_id").primaryKey(),
  userId: text("user_id").notNull(),
  deviceId: text("device_id"),
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  op: text("op").notNull(),
  receivedAt: integer("received_at").notNull(),
});

/** Fila única (id = 1) con la última versión entregada. */
export const syncSeq = sqliteTable("sync_seq", {
  id: integer("id").primaryKey(),
  v: integer("v").notNull(),
});
