/** Clima diario y climatología, pronósticos, focos de calor y análisis por lote calculados fuera del Worker. */

import { HISTORY_STATUSES } from "./satellite";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** plot_id = "" cuando el dato es por estancia (SQLite no admite NULL útil en la PK). */
export const climateDaily = sqliteTable(
  "climate_daily",
  {
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull().default(""),
    date: text("date").notNull(),
    source: text("source").notNull(),
    precipMm: real("precip_mm"),
    tminC: real("tmin_c"),
    tmaxC: real("tmax_c"),
    soilMoisture0_7: real("soil_moisture_0_7"),
    soilMoisture7_28: real("soil_moisture_7_28"),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.plotId, t.date, t.source] })],
);

/** Climatología por día del año y variable: percentiles de referencia de la serie histórica. */
export const climatology = sqliteTable(
  "climatology",
  {
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull().default(""),
    dayOfYear: integer("day_of_year").notNull(),
    variable: text("var").notNull(),
    p20: real("p20"),
    p50: real("p50"),
    p80: real("p80"),
    mean: real("mean"),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.plotId, t.dayOfYear, t.variable] })],
);

/** Áreas problema dentro de un lote en la última escena. Solo las escribe /ingest; no se sincronizan. */
export const problemAreas = sqliteTable(
  "problem_areas",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    geometry: text("geometry").notNull(),
    lon: real("lon").notNull(),
    lat: real("lat").notNull(),
    areaHa: real("area_ha").notNull(),
    meanNdvi: real("mean_ndvi").notNull(),
    plotMedianNdvi: real("plot_median_ndvi").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("problem_areas_plot_idx").on(t.plotId), index("problem_areas_farm_idx").on(t.farmId)],
);

/**
 * Indicador EUDR por lote: hectáreas con cobertura arbórea en 2020 y con posible pérdida hasta hoy,
 * calculado por workers-py con Sentinel-2. Una fila por lote; `changes` es un GeoJSON chico con los polígonos
 * de cambio. Análisis indicativo, no una declaración de debida diligencia. Solo lo escribe /ingest; no se sincroniza.
 */
export const eudrResults = sqliteTable(
  "eudr_results",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    /** no_change | possible_loss | no_data */
    status: text("status").notNull(),
    plotAreaHa: real("plot_area_ha").notNull(),
    forestRefHa: real("forest_ref_ha").notNull(),
    lossHa: real("loss_ha").notNull(),
    validPct: real("valid_pct").notNull(),
    refYear: integer("ref_year").notNull(),
    curYear: integer("cur_year").notNull(),
    refFromAt: integer("ref_from_at"),
    refToAt: integer("ref_to_at"),
    curFromAt: integer("cur_from_at"),
    curToAt: integer("cur_to_at"),
    refScenes: integer("ref_scenes").notNull(),
    curScenes: integer("cur_scenes").notNull(),
    /** FeatureCollection de polígonos de cambio (WGS84), con `areaHa` en las propiedades. */
    changes: text("changes").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (t) => [uniqueIndex("eudr_results_plot_uq").on(t.plotId), index("eudr_results_farm_idx").on(t.farmId)],
);

/** Campos propios por tipo de registro de cada organización (JSON validado con formConfigSchema). No se sincroniza: la app lo pide por /org/form-config. */
export const formConfigs = sqliteTable("form_configs", {
  organizationId: text("organization_id").primaryKey(),
  config: text("config").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

/** Análisis por lote calculados por workers-py con Sentinel-2: área quemada y cambio de cobertura. */
export const ANALYSIS_KINDS = ["burned", "cover_change"] as const;
/** Tipo de análisis por lote que calcula workers-py. */
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

/**
 * Una fila por lote, tipo de análisis y referencia (burned: fecha ISO del primer foco; cover_change: "desde_hasta").
 * `metrics` es un JSON chico según el tipo y `changes` un FeatureCollection con los polígonos. Solo lo escribe
 * /ingest; no se sincroniza. Análisis indicativo.
 */
export const plotAnalyses = sqliteTable(
  "plot_analyses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    kind: text("kind", { enum: ANALYSIS_KINDS }).notNull(),
    refKey: text("ref_key").notNull(),
    /** Fecha de la imagen "antes" y de la imagen "después". */
    fromAt: integer("from_at"),
    toAt: integer("to_at"),
    plotAreaHa: real("plot_area_ha").notNull(),
    validPct: real("valid_pct").notNull(),
    metrics: text("metrics").notNull(),
    changes: text("changes").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (t) => [
    uniqueIndex("plot_analyses_uq").on(t.plotId, t.kind, t.refKey),
    index("plot_analyses_farm_idx").on(t.farmId, t.kind),
  ],
);

/** Pedidos a demanda de análisis pesados por estancia. No se sincroniza. */
export const analysisJobs = sqliteTable(
  "analysis_jobs",
  {
    farmId: text("farm_id").notNull(),
    kind: text("kind", { enum: ANALYSIS_KINDS }).notNull(),
    organizationId: text("organization_id").notNull(),
    status: text("status", { enum: HISTORY_STATUSES }).notNull(),
    /** Parámetros del pedido (JSON): fechas del cambio de cobertura. */
    params: text("params").notNull().default("{}"),
    requestedAt: integer("requested_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.kind] })],
);

/** Informe de riesgo climático por estancia: JSON validado con farmRiskSchema. No se sincroniza. */
export const farmRisk = sqliteTable("farm_risk", {
  farmId: text("farm_id").primaryKey(),
  computedAt: integer("computed_at").notNull(),
  report: text("report").notNull(),
});

/** SPI a 1, 3 y 6 meses por estancia: JSON validado con farmSpiSchema. Una fila por estancia; no se sincroniza. */
export const farmSpi = sqliteTable("farm_spi", {
  farmId: text("farm_id").primaryKey(),
  computedAt: integer("computed_at").notNull(),
  report: text("report").notNull(),
});

/**
 * Comparación anónima de una estancia con la mediana de las estancias de otras organizaciones dentro de un radio.
 * La calcula un cron con acceso de sistema; acá solo quedan números de la propia estancia, las medianas y cuántas
 * estancias entraron (nunca ids, nombres ni geometrías ajenas). Una fila por estancia; si dejan de alcanzar los
 * vecinos, la fila se borra. No se sincroniza.
 */
export const zoneBenchmarks = sqliteTable("zone_benchmarks", {
  farmId: text("farm_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  computedAt: integer("computed_at").notNull(),
  radiusKm: integer("radius_km").notNull(),
  windowDays: integer("window_days").notNull(),
  nFarms: integer("n_farms").notNull(),
  ndvi: real("ndvi"),
  ndviMedian: real("ndvi_median"),
  rainMm: real("rain_mm"),
  rainMedianMm: real("rain_median_mm"),
});

/** Pronóstico diario por estancia o lote; cada corrida reemplaza a la anterior de su fuente. */
export const forecasts = sqliteTable(
  "forecasts",
  {
    farmId: text("farm_id").notNull(),
    runAt: integer("run_at").notNull(),
    source: text("source").notNull(),
    validDate: text("valid_date").notNull(),
    tminC: real("tmin_c"),
    tmaxC: real("tmax_c"),
    precipMm: real("precip_mm"),
    windKmh: real("wind_kmh"),
    windDirDeg: real("wind_dir_deg"),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.runAt, t.validDate] })],
);

/** Pronóstico horario de MET Norway (próximas horas) para las ventanas de pulverización. Solo la última corrida. */
export const forecastHours = sqliteTable(
  "forecast_hours",
  {
    farmId: text("farm_id").notNull(),
    /** Inicio de la hora, epoch ms UTC. */
    validAt: integer("valid_at").notNull(),
    tempC: real("temp_c"),
    windKmh: real("wind_kmh"),
    humidityPct: real("humidity_pct"),
    precipMm: real("precip_mm"),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.validAt] })],
);

/**
 * Pronóstico diario de MET Norway por lote en estancias de más de 2.000 ha, en el centro del lote.
 * Solo la última corrida (se reemplaza). No se sincroniza.
 */
export const plotForecasts = sqliteTable(
  "plot_forecasts",
  {
    plotId: text("plot_id").notNull(),
    farmId: text("farm_id").notNull(),
    validDate: text("valid_date").notNull(),
    runAt: integer("run_at").notNull(),
    tminC: real("tmin_c"),
    tmaxC: real("tmax_c"),
    precipMm: real("precip_mm"),
    windKmh: real("wind_kmh"),
  },
  (t) => [primaryKey({ columns: [t.plotId, t.validDate] }), index("plot_forecasts_farm_idx").on(t.farmId)],
);

/** Focos de calor detectados por satélite. */
export const fireHotspots = sqliteTable(
  "fire_hotspots",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    lon: real("lon").notNull(),
    lat: real("lat").notNull(),
    confidence: text("confidence"),
    frp: real("frp"),
  },
  (t) => [index("fire_hotspots_time_idx").on(t.acquiredAt)],
);
