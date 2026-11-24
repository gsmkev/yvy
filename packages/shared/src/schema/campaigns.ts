/** Campañas, lotes por campaña, catálogo de productos y animales; son tablas sincronizables. */

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { ANIMAL_SEXES } from "../animals";
import { HERD_CATEGORIES } from "../livestock";
import { CROPS, DENSITY_UNITS, PRODUCT_TYPES, PRODUCT_UNITS } from "./enums";
import { synced } from "./columns";

// ---------- Campañas ----------

/** Campaña de la organización ("Zafra 2026/27"). Fechas de calendario "YYYY-MM-DD". */
export const seasons = sqliteTable(
  "seasons",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...synced,
  },
  (t) => [index("seasons_sync_idx").on(t.organizationId, t.version, t.id)],
);

/** Qué se planifica o se sembró en un lote en una campaña. Una fila por (lote, campaña). */
export const plotSeasons = sqliteTable(
  "plot_seasons",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    plotId: text("plot_id").notNull(),
    seasonId: text("season_id").notNull(),
    crop: text("crop", { enum: CROPS }),
    variety: text("variety"),
    plannedSowingDate: text("planned_sowing_date"),
    /** Densidad de siembra prevista y su unidad. */
    sowingDensity: real("sowing_density"),
    densityUnit: text("density_unit", { enum: DENSITY_UNITS }),
    /** Rinde objetivo en toneladas por hectárea. */
    targetYieldTHa: real("target_yield_t_ha"),
    ...synced,
  },
  (t) => [
    uniqueIndex("plot_seasons_plot_season_uq").on(t.plotId, t.seasonId),
    index("plot_seasons_sync_idx").on(t.organizationId, t.version, t.id),
    index("plot_seasons_season_idx").on(t.seasonId),
  ],
);

/** Catálogo de productos de la organización (insumos). Baja al celular para cargar aplicaciones sin señal. */
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: PRODUCT_TYPES }).notNull(),
    unit: text("unit", { enum: PRODUCT_UNITS }).notNull(),
    activeIngredient: text("active_ingredient"),
    /** Días de carencia antes de cosechar o de pastorear. */
    withdrawalDays: integer("withdrawal_days"),
    toxClass: text("tox_class"),
    ...synced,
  },
  (t) => [index("products_sync_idx").on(t.organizationId, t.version, t.id)],
);

/**
 * Animales con caravana. La hacienda sigue contándose por potrero y categoría; esta tabla es para quien
 * identifica a algunos animales individualmente. La caravana es única en la organización entre los no borrados.
 */
export const animals = sqliteTable(
  "animals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    /** En mayúsculas (ver normalizeTag). */
    tag: text("tag").notNull(),
    category: text("category", { enum: HERD_CATEGORIES }).notNull(),
    sex: text("sex", { enum: ANIMAL_SEXES }).notNull(),
    birthDate: text("birth_date"),
    note: text("note"),
    ...synced,
  },
  (t) => [
    uniqueIndex("animals_org_tag_uq")
      .on(t.organizationId, t.tag)
      .where(sql`deleted_at IS NULL`),
    index("animals_sync_idx").on(t.organizationId, t.version, t.id),
    index("animals_farm_idx").on(t.farmId),
  ],
);
