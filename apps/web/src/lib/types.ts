import type { MultiPolygon, Polygon } from "geojson";

export interface Me {
  user: { id: string; fullName: string; email: string | null };
  organization: { id: string; name: string; plan: string; trialEndsAt: number | null };
  role: "owner" | "admin" | "agronomist" | "worker";
  tilesBaseUrl: string;
  isStaff: boolean;
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
}

export interface Farm extends FarmSummary {
  district: string | null;
  timezone: string;
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
}

export interface Poi {
  id: string;
  farmId: string;
  kind: string;
  name: string;
  lon: number;
  lat: number;
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
  capturedAt: number;
  attachments: { id: string; uploadStatus: string }[];
}

export interface Member {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Me["role"];
  status: string;
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
  recurrence: "none" | "daily" | "weekly";
  status: "open" | "done" | "cancelled";
  completedAt: number | null;
}

export interface Alert {
  id: string;
  farmId: string;
  kind: "frost" | "excess_rain" | "drought" | "fire";
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
