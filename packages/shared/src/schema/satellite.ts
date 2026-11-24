/** Escenas satelitales, estadísticas de índices por lote, capas de mapa y estado de la historia de vigor. */

import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { LAYERS, CUSTOM_LAYER_KINDS, CUSTOM_LAYER_STATUSES, IMAGERY_STATUSES } from "./enums";
import { synced } from "./columns";

// ---------- Satélite y clima (escritas solo por /ingest y crons) ----------

/** Escenas satelitales procesadas, compartidas entre organizaciones. */
export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    itemId: text("item_id").notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    cloudPct: real("cloud_pct"),
    processedAt: integer("processed_at"),
  },
  (t) => [uniqueIndex("scenes_item_uq").on(t.source, t.itemId)],
);

/** Estadísticas de un índice de vegetación por lote y escena. */
export const plotIndexStats = sqliteTable(
  "plot_index_stats",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    plotId: text("plot_id").notNull(),
    sceneId: text("scene_id").notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    idx: text("idx").notNull().default("ndvi"),
    mean: real("mean").notNull(),
    p10: real("p10").notNull(),
    p90: real("p90").notNull(),
    validPct: real("valid_pct").notNull(),
    /** Lote de menos de 30 m de ancho; los píxeles mezclan con el borde y el dato es poco confiable. */
    lowConfidence: integer("low_confidence", { mode: "boolean" }).notNull().default(false),
    ...synced,
  },
  (t) => [
    uniqueIndex("plot_index_stats_uq").on(t.plotId, t.sceneId, t.idx),
    index("plot_index_stats_sync_idx").on(t.organizationId, t.version, t.id),
  ],
);

/** Capas raster publicadas por estancia (índice, color real o fertilidad) para una fecha. */
export const farmLayers = sqliteTable(
  "farm_layers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    layer: text("layer", { enum: LAYERS }).notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    pmtilesPath: text("pmtiles_path").notNull(),
    bytes: integer("bytes").notNull(),
    bounds: text("bounds").notNull(),
    ...synced,
  },
  (t) => [
    index("farm_layers_sync_idx").on(t.organizationId, t.version, t.id),
    index("farm_layers_farm_idx").on(t.farmId, t.layer, t.acquiredAt),
  ],
);

/**
 * Capa propia de una estancia: imagen de dron, mapa de suelos o cualquier PNG/JPG con 4 esquinas. El archivo
 * original va a R2 (bucket de media); un GeoTIFF lo convierte workers-py a PNG georreferenciado en WGS84.
 * `corners` = [[lon, lat] × 4] en orden arriba-izq., arriba-der., abajo-der., abajo-izq. Solo la web la usa (no está en el pull).
 */
export const customLayers = sqliteTable(
  "custom_layers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: CUSTOM_LAYER_KINDS }).notNull(),
    status: text("status", { enum: CUSTOM_LAYER_STATUSES }).notNull(),
    mime: text("mime").notNull(),
    originalPath: text("original_path").notNull(),
    /** PNG/JPG que se dibuja en el mapa; null mientras un GeoTIFF se procesa. */
    imagePath: text("image_path"),
    imageMime: text("image_mime"),
    bytes: integer("bytes").notNull(),
    corners: text("corners"),
    ...synced,
  },
  (t) => [
    index("custom_layers_sync_idx").on(t.organizationId, t.version, t.id),
    index("custom_layers_farm_idx").on(t.farmId, t.status),
  ],
);

/** Estado del primer procesamiento satelital por estancia. No se sincroniza: solo lo lee la web. */
export const farmImagery = sqliteTable("farm_imagery", {
  farmId: text("farm_id").primaryKey(),
  status: text("status", { enum: IMAGERY_STATUSES }).notNull().default("pending"),
  requestedAt: integer("requested_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Estado de la historia de vigor desde 2017 pedida a demanda por estancia. No se sincroniza. */
export const HISTORY_STATUSES = ["processing", "done", "failed"] as const;
/** Pedido de historia de vigor desde 2017 por estancia. */
export const farmHistory = sqliteTable("farm_history", {
  farmId: text("farm_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  status: text("status", { enum: HISTORY_STATUSES }).notNull(),
  requestedAt: integer("requested_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
