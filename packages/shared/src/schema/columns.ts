import { integer, real } from "drizzle-orm/sqlite-core";

// ---------- Columnas comunes ----------

export const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
};

export const synced = {
  ...timestamps,
  version: integer("version").notNull().default(0),
};

export const bbox = {
  minLon: real("min_lon").notNull(),
  minLat: real("min_lat").notNull(),
  maxLon: real("max_lon").notNull(),
  maxLat: real("max_lat").notNull(),
};
