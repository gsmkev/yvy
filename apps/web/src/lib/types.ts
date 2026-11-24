/** Tipos de las respuestas de la API que usa la web. Reflejan el JSON que devuelve el Worker; no validan en tiempo de ejecución. */
import type { PoiKind } from "@yvy/shared";
import type { MultiPolygon, Polygon } from "geojson";
import type { Role } from "@yvy/shared";

/** Sesión actual: usuario, organización, rol, URL base de las teselas y si es del equipo de Yvy. */
export interface Me {
  user: { id: string; fullName: string; email: string | null };
  organization: { id: string; name: string; plan: string; trialEndsAt: number | null };
  role: Role;
  tilesBaseUrl: string;
  isStaff: boolean;
  /** Sesión de soporte de solo lectura. */
  support?: boolean;
}

/** Estancia con las cifras para listas y tarjetas (superficie, centroide, caja envolvente, lotes, personal, avisos). */
export interface FarmSummary {
  id: string;
  name: string;
  department: string | null;
  areaHa: number;
  centroidLon: number;
  centroidLat: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  plots: number;
  workers: number;
  activeAlerts: number;
  lastRecordAt: number | null;
  records7d: number;
  geometry: string;
  basemapPath: string | null;
  timezone: string;
}

/** Estancia con sus datos administrativos. */
export interface Farm extends FarmSummary {
  district: string | null;
}

/** Lote o potrero. `geometry` es GeoJSON en texto. */
export interface Plot {
  id: string;
  farmId: string;
  name: string;
  kind: "crop" | "pasture";
  geometry: string;
  areaHa: number;
  crop: string | null;
  season: string | null;
  sowingDate: string | null;
  pastureType: string | null;
  color: string | null;
  /** Última y penúltima pasada NDVI (media y fecha) y última visita; null si no hay. */
  ndviMean: number | null;
  ndviAt: number | null;
  ndviPrevMean: number | null;
  ndviPrevAt: number | null;
  lastRecordAt: number | null;
}

/** Línea de la estancia (alambrado, camino o cañería) con su geometría en GeoJSON texto. */
export interface FarmLine {
  id: string;
  farmId: string;
  kind: "fence" | "road" | "pipe" | "stream";
  name: string;
  /** GeoJSON LineString. */
  geometry: string;
  lengthM: number;
}

/** Punto de interés de la estancia (bebedero, silo, pluviómetro, etc.). */
export interface Poi {
  id: string;
  farmId: string;
  kind: PoiKind;
  name: string;
  lon: number;
  lat: number;
  /** Último nivel de agua registrado (solo aguadas y tajamares). */
  lastWaterLevel?: string | null;
  lastWaterAt?: number | null;
}

/** Capa raster disponible de la estancia en una fecha. */
export interface Layer {
  id: string;
  layer: "true_color" | "ndvi" | "ndre" | "ndmi" | "evi" | "fert_ph" | "fert_p" | "fert_k" | "fert_om";
  acquiredAt: number;
  pmtilesPath: string;
  bytes: number;
  bounds: string;
}

/** Estancia con sus lotes, puntos, líneas y capas. */
export interface FarmDetail {
  farm: Farm;
  plots: Plot[];
  pois: Poi[];
  layers: Layer[];
  assignments: { plotId: string; userId: string }[];
  /** Procesamiento de imágenes al crear la estancia; null si es anterior a esa función. */
  imageryStatus: "pending" | "processing" | "ready" | "failed" | null;
  imageryRequestedAt: number | null;
}

/** Registro de campo (monitoreo, aplicación, lluvia, etc.). */
export interface RecordRow {
  id: string;
  farmId: string;
  plotId: string | null;
  poiId: string | null;
  authorId: string;
  authorName: string | null;
  plotName: string | null;
  kind: string;
  data: Record<string, unknown>;
  lon: number | null;
  lat: number | null;
  gpsAccuracyM: number | null;
  capturedAt: number;
  attachments: { id: string; uploadStatus: string; mime?: string }[];
}

/** Miembro de la organización con su rol y su actividad reciente. */
export interface Member {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Me["role"];
  status: string;
  /** Días con actividad en los últimos 7. */
  activeDays7: number;
  records7d: number;
  /** Lotes distintos en los que anotó en los últimos 7 días. */
  plotsVisited7d: number;
  lastSyncAt: number | null;
  /** Tareas abiertas vencidas (con la hora límite, en la hora de la estancia). */
  overdueTasks: number;
  /** Ingresa con teléfono y PIN. */
  hasPin?: boolean;
}

/** Tarea asignada, con sus lotes, estado y vencimiento. */
export interface Task {
  id: string;
  farmId: string;
  plotId: string | null;
  assigneeId: string;
  assigneeName: string | null;
  plotName: string | null;
  title: string;
  kind: string | null;
  dueDate: string;
  dueTime: string | null;
  priority: "low" | "normal" | "high";
  /** JSON: ver parseTaskComments en @yvy/shared. */
  comments: string;
  recurrence: "none" | "daily" | "weekly";
  status: "open" | "done" | "cancelled";
  completedAt: number | null;
  /** Lista de verificación en JSON; ver parseChecklist. */
  checklist: string | null;
}

/** Aviso generado por el sistema para una estancia, con su severidad y vigencia. */
export interface Alert {
  id: string;
  farmId: string;
  kind: "frost" | "excess_rain" | "drought" | "fire" | "pest_threshold" | "water_low" | "heat_stress" | "rust_risk" | "senacsa";
  severity: "info" | "watch" | "warning";
  probability: "low" | "medium" | "high" | null;
  validFrom: number;
  validTo: number | null;
  plotIds: string[];
  summary: string;
  source: string;
  useful: boolean | null;
}

/** Geometría de un área: polígono o multipolígono. */
export type Area = Polygon | MultiPolygon;

/** Área del lote con vigor muy por debajo de la mediana. */
export interface ProblemArea {
  id: string;
  plotId: string;
  plotName: string;
  acquiredAt: number;
  geometry: string;
  lon: number;
  lat: number;
  areaHa: number;
  meanNdvi: number;
  plotMedianNdvi: number;
}

/** Indicador EUDR de un lote, calculado con Sentinel-2 por workers-py. Análisis indicativo. */
export interface EudrPlot {
  plotId: string;
  plotName: string;
  status: "no_change" | "possible_loss" | "no_data";
  plotAreaHa: number;
  forestRefHa: number;
  lossHa: number;
  validPct: number;
  refYear: number;
  curYear: number;
  refFromAt: number | null;
  refToAt: number | null;
  curFromAt: number | null;
  curToAt: number | null;
  refScenes: number;
  curScenes: number;
  /** FeatureCollection (texto) con los polígonos de cambio. */
  changes: string;
  computedAt: number;
}

/** Respuesta del indicador EUDR de una estancia. */
export interface EudrResponse {
  computedAt: number | null;
  plots: EudrPlot[];
}

/** Lote analizado por un trabajo a demanda (tipo de @yvy/shared, reexportado). */
export type { AnalysisPlot, BurnedMetrics, CoverMetrics } from "@yvy/shared";

/** Estado de un trabajo de análisis a demanda (procesando, listo o fallido). */
export interface AnalysisJob {
  status: "processing" | "done" | "failed" | null;
  params: { from?: string; to?: string } | null;
  requestedAt: number | null;
}

/** Producto del catálogo de la organización. */
export interface Product {
  id: string;
  name: string;
  type: "seed" | "agrochemical" | "fertilizer" | "fuel" | "veterinary" | "other";
  unit: "l" | "kg";
  activeIngredient: string | null;
  withdrawalDays: number | null;
  toxClass: string | null;
}

/** Campaña de la organización. */
export interface Season {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

/** Plan de cultivo de un lote en una campaña. */
export interface PlotSeason {
  id: string;
  plotId: string;
  seasonId: string;
  crop: string | null;
  variety: string | null;
  plannedSowingDate: string | null;
  sowingDensity: number | null;
  densityUnit: "seeds_m" | "kg_ha" | null;
  targetYieldTHa: number | null;
}

/** Una campaña en el historial de rotación de un lote. */
export interface PlotHistoryRow {
  seasonId: string;
  seasonName: string;
  startDate: string | null;
  crop: string | null;
  variety: string | null;
  plannedSowingDate: string | null;
  sowingDensity: number | null;
  densityUnit: string | null;
  targetYieldTHa: number | null;
  sownOn: number | null;
  harvestTons: number | null;
  yieldTHa: number | null;
}
