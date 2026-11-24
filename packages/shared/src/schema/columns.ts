/** Columnas Drizzle reutilizadas por las tablas: marcas de tiempo, versión de sincronización y caja envolvente. */

import { integer, real } from "drizzle-orm/sqlite-core";

// ---------- Columnas comunes ----------

/** Fechas de creación, cambio y borrado lógico, en epoch ms. */
export const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
};

/** Columnas de una tabla sincronizable: marcas de tiempo y `version` asignada por el servidor. */
export const synced = {
  ...timestamps,
  version: integer("version").notNull().default(0),
};

/** Caja envolvente en grados para filtrar por zona sin abrir la geometría. */
export const bbox = {
  minLon: real("min_lon").notNull(),
  minLat: real("min_lat").notNull(),
  maxLon: real("max_lon").notNull(),
  maxLat: real("max_lat").notNull(),
};
