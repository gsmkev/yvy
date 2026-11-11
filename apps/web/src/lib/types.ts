import type { MultiPolygon, Polygon } from "geojson";

export interface Me {
  user: { id: string; fullName: string; email: string | null };
  organization: { id: string; name: string; plan: string; trialEndsAt: number | null };
  role: "owner" | "admin" | "agronomist" | "worker";
  tilesBaseUrl: string;
  isStaff: boolean;
  /** P-12: sesión de soporte de solo lectura. */
  support?: boolean;
}

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

export interface Farm extends FarmSummary {
  district: string | null;
}

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

export interface FarmLine {
  id: string;
  farmId: string;
  kind: "fence" | "road" | "pipe";
  name: string;
  /** GeoJSON LineString. */
  geometry: string;
  lengthM: number;
}

export interface Poi {
  id: string;
  farmId: string;
  kind: string;
  name: string;
  lon: number;
  lat: number;
  /** Último nivel de agua registrado (solo aguadas y tajamares). */
  lastWaterLevel?: string | null;
  lastWaterAt?: number | null;
}

export interface Layer {
  id: string;
  layer: "true_color" | "ndvi";
  acquiredAt: number;
  pmtilesPath: string;
  bytes: number;
  bounds: string;
}

export interface FarmDetail {
  farm: Farm;
  plots: Plot[];
  pois: Poi[];
  layers: Layer[];
  assignments: { plotId: string; userId: string }[];
  /** Procesamiento de imágenes al crear la estancia (S-02); null si es anterior a esa función. */
  imageryStatus: "pending" | "processing" | "ready" | "failed" | null;
  imageryRequestedAt: number | null;
}

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
  lastSyncAt: number | null;
}

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
  /** Lista de verificación en JSON (F-15); ver parseChecklist. */
  checklist: string | null;
}

export interface Alert {
  id: string;
  farmId: string;
  kind: "frost" | "excess_rain" | "drought" | "fire" | "pest_threshold" | "water_low";
  severity: "info" | "watch" | "warning";
  probability: "low" | "medium" | "high" | null;
  validFrom: number;
  validTo: number | null;
  plotIds: string[];
  summary: string;
  source: string;
  useful: boolean | null;
}

export type Area = Polygon | MultiPolygon;

/** Área del lote con vigor muy por debajo de la mediana (S-08). */
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

/** Indicador EUDR de un lote (S-30), calculado con Sentinel-2 por workers-py. Análisis indicativo. */
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

export interface EudrResponse {
  computedAt: number | null;
  plots: EudrPlot[];
}

export interface Product {
  id: string;
  name: string;
  type: "seed" | "agrochemical" | "fertilizer" | "fuel" | "veterinary" | "other";
  unit: "l" | "kg";
  activeIngredient: string | null;
  withdrawalDays: number | null;
  toxClass: string | null;
}

export interface Season {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

export interface PlotSeason {
  id: string;
  plotId: string;
  seasonId: string;
  crop: string | null;
  variety: string | null;
  plannedSowingDate: string | null;
  targetYieldTHa: number | null;
}

/** Una campaña en el historial de rotación de un lote (A-02). */
export interface PlotHistoryRow {
  seasonId: string;
  seasonName: string;
  startDate: string | null;
  crop: string | null;
  variety: string | null;
  plannedSowingDate: string | null;
  targetYieldTHa: number | null;
  sownOn: number | null;
  harvestTons: number | null;
  yieldTHa: number | null;
}
