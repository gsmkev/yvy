/**
 * Formas de las respuestas REST que consumen las pantallas de oficina (la web y la app móvil). Son lo que el Worker
 * devuelve hoy; no agregan lógica. La web todavía tiene sus copias en apps/web/src/lib/types.ts.
 */
import type { Oddity } from "./oddities";
import type { Role } from "./schema";

export interface OrgRef {
  id: string;
  name: string;
  role: Role;
}

export interface ApiMember {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: string;
  /** Días con actividad en los últimos 7. */
  activeDays7: number;
  records7d: number;
  plotsVisited7d: number;
  lastSyncAt: number | null;
  /** Tareas abiertas vencidas. */
  overdueTasks: number;
  hasPin?: boolean;
}

export interface ApiTask {
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
  status: "open" | "done" | "cancelled";
}

export interface ReviewItem {
  recordId: string;
  farmName: string;
  plotName: string | null;
  authorName: string | null;
  kind: string;
  capturedAt: number;
  data: Record<string, unknown>;
  oddities: Oddity[];
}

export interface OwnerDashboard {
  /** Solo viene para quien ve montos (dueño y administrador). Es plata: la app no lo guarda en el celular. */
  margin: { incomePyg: number; costPyg: number; marginPyg: number; entries: number } | null;
  areaByCrop: { crop: string | null; kind: "crop" | "pasture"; ha: number; plots: number }[];
  rain: { month: string; farmsWithData: number; mm: number | null; normalMm: number | null; pctOfNormal: number | null };
  alerts: { total: number; byKind: { kind: string; severity: string; n: number }[] };
  activity: { workers: number; activeWorkers7d: number; staff: number; activeStaff7d: number };
  records7d: { total: number; byWorkers: number; byKind: { kind: string; n: number }[] };
}

export interface ClientFarm {
  id: string;
  name: string;
  department: string | null;
  areaHa: number;
  plots: number;
  activeAlerts: number;
  lastRecordAt: number | null;
  records7d: number;
}

export interface ClientOrg {
  organization: OrgRef;
  farms: ClientFarm[];
  alerts: { id: string; farmId: string; kind: string; severity: string; summary: string }[];
}

export interface ClimateDay {
  date: string;
  source: string;
  precipMm: number | null;
  tminC?: number | null;
  tmaxC?: number | null;
}

export interface ApiFarmClimate {
  daily: ClimateDay[];
  forecast: { validDate: string; precipMm: number | null; tminC: number | null; tmaxC: number | null }[];
  forecastRunAt: number | null;
  gauge: { capturedAt: number; poiId: string | null; mm: number }[];
}

export interface ShareLinkRow {
  id: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface ApiFarmSummary {
  id: string;
  name: string;
  department: string | null;
  areaHa: number;
  plots: number;
  activeAlerts: number;
  lastRecordAt: number | null;
  records7d: number;
}

export interface ApiRecordPage {
  rows: { id: string; authorId: string; capturedAt: number; kind: string; attachments: { id: string; uploadStatus: string; mime?: string }[] }[];
  nextCursor: { capturedAt: number; id: string } | null;
}
