import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { PLOT_KINDS, CROPS, SEASONS, POI_KINDS, LINE_KINDS } from "./enums";
import { synced, bbox } from "./columns";

// ---------- Campo ----------

/** Estancia. */
export const farms = sqliteTable(
  "farms",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    department: text("department"),
    district: text("district"),
    geometry: text("geometry").notNull(),
    ...bbox,
    centroidLon: real("centroid_lon").notNull(),
    centroidLat: real("centroid_lat").notNull(),
    areaHa: real("area_ha").notNull(),
    timezone: text("timezone").notNull().default("America/Asuncion"),
    offlinePackVersion: integer("offline_pack_version").notNull().default(0),
    ...synced,
  },
  (t) => [index("farms_sync_idx").on(t.organizationId, t.version, t.id)],
);

/** Lote o potrero. */
export const plots = sqliteTable(
  "plots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: PLOT_KINDS }).notNull(),
    geometry: text("geometry").notNull(),
    ...bbox,
    areaHa: real("area_ha").notNull(),
    crop: text("crop", { enum: CROPS }),
    season: text("season", { enum: SEASONS }),
    sowingDate: text("sowing_date"),
    pastureType: text("pasture_type"),
    color: text("color"),
    ...synced,
  },
  (t) => [
    index("plots_sync_idx").on(t.organizationId, t.version, t.id),
    index("plots_farm_idx").on(t.farmId),
    index("plots_bbox_idx").on(t.organizationId, t.minLon, t.maxLon, t.minLat, t.maxLat),
  ],
);

export const pointsOfInterest = sqliteTable(
  "points_of_interest",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    kind: text("kind", { enum: POI_KINDS }).notNull(),
    name: text("name").notNull(),
    lon: real("lon").notNull(),
    lat: real("lat").notNull(),
    ...synced,
  },
  (t) => [index("poi_sync_idx").on(t.organizationId, t.version, t.id), index("poi_farm_idx").on(t.farmId)],
);

/**
 * Línea del mapa de una estancia (M-20): alambrado, camino interno o cañería, con su largo en metros.
 * Por ahora solo la web la usa; no está en el pull del sync (se suma cuando la app la necesite).
 */
export const farmLines = sqliteTable(
  "farm_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    kind: text("kind", { enum: LINE_KINDS }).notNull(),
    name: text("name").notNull(),
    /** GeoJSON LineString. */
    geometry: text("geometry").notNull(),
    ...bbox,
    lengthM: real("length_m").notNull(),
    ...synced,
  },
  (t) => [
    index("farm_lines_sync_idx").on(t.organizationId, t.version, t.id),
    index("farm_lines_farm_idx").on(t.farmId),
  ],
);

/**
 * Análisis de suelo de laboratorio (A-30): por lote o por punto de muestreo. Solo la web lo usa por ahora
 * (no está en el pull del sync). Valores nulos = el laboratorio no lo informó.
 */
export const soilSamples = sqliteTable(
  "soil_samples",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id"),
    /** Nombre o número del punto de muestreo ("P-07"). */
    pointLabel: text("point_label"),
    lon: real("lon"),
    lat: real("lat"),
    /** Fecha de muestreo "YYYY-MM-DD". */
    sampledOn: text("sampled_on").notNull(),
    depthCm: integer("depth_cm").notNull().default(20),
    lab: text("lab"),
    ph: real("ph"),
    /** Fósforo (Mehlich-1), mg/kg. */
    pMgKg: real("p_mg_kg"),
    /** Potasio, cmolc/kg. */
    kCmolKg: real("k_cmol_kg"),
    /** Materia orgánica, %. */
    omPct: real("om_pct"),
    note: text("note"),
    ...synced,
  },
  (t) => [
    index("soil_samples_sync_idx").on(t.organizationId, t.version, t.id),
    index("soil_samples_farm_idx").on(t.farmId),
    index("soil_samples_plot_idx").on(t.plotId),
  ],
);

/**
 * Entrega de grano a un acopio o silo (A-23): ticket de balanza con humedad, descuentos y neto, por lote.
 * Pesos en kilos. Solo la web la usa (no está en el pull del sync).
 */
export const grainDeliveries = sqliteTable(
  "grain_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id"),
    seasonId: text("season_id"),
    crop: text("crop", { enum: CROPS }).notNull(),
    ticket: text("ticket").notNull(),
    silo: text("silo").notNull(),
    deliveredOn: text("delivered_on").notNull(),
    grossKg: real("gross_kg").notNull(),
    moisturePct: real("moisture_pct"),
    baseMoisturePct: real("base_moisture_pct").notNull(),
    impuritiesPct: real("impurities_pct").notNull().default(0),
    otherKg: real("other_kg").notNull().default(0),
    /** Calculado al guardar con grainNet (packages/shared). */
    netKg: real("net_kg").notNull(),
    note: text("note"),
    /** E-34: contrato de venta al que se entregó (vacío = entrega a acopio sin contrato). */
    contractId: text("contract_id"),
    ...synced,
  },
  (t) => [
    index("grain_deliveries_contract_idx").on(t.organizationId, t.contractId),
    index("grain_deliveries_sync_idx").on(t.organizationId, t.version, t.id),
    index("grain_deliveries_farm_idx").on(t.farmId, t.deliveredOn),
    index("grain_deliveries_plot_idx").on(t.plotId),
  ],
);

/**
 * Mapa de rendimiento de la cosechadora de un lote en una campaña (A-21). El archivo (shapefile) se procesa en el
 * navegador; acá queda el resumen y una grilla de promedios en `cells` (JSON [[lon, lat, t/ha, puntos], ...]).
 * Solo la web lo usa (no está en el pull del sync).
 */
export const yieldMaps = sqliteTable(
  "yield_maps",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    seasonId: text("season_id"),
    fileName: text("file_name").notNull(),
    nPoints: integer("n_points").notNull(),
    nDropped: integer("n_dropped").notNull(),
    meanTHa: real("mean_t_ha").notNull(),
    p10THa: real("p10_t_ha").notNull(),
    p90THa: real("p90_t_ha").notNull(),
    minTHa: real("min_t_ha").notNull(),
    maxTHa: real("max_t_ha").notNull(),
    cvPct: real("cv_pct").notNull(),
    cellM: integer("cell_m").notNull(),
    cells: text("cells").notNull(),
    ...synced,
  },
  (t) => [
    index("yield_maps_sync_idx").on(t.organizationId, t.version, t.id),
    index("yield_maps_plot_idx").on(t.plotId, t.seasonId),
  ],
);

export const plotAssignments = sqliteTable(
  "plot_assignments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    plotId: text("plot_id").notNull(),
    userId: text("user_id").notNull(),
    ...synced,
  },
  (t) => [
    uniqueIndex("plot_assignments_uq").on(t.userId, t.plotId),
    index("plot_assignments_sync_idx").on(t.organizationId, t.version, t.id),
  ],
);
