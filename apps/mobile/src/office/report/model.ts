/** Datos del parte semanal: consultas, conteos por tipo y autor, lluvia por día y cifras del período. */
import { useMemo } from "react";
import { addDays, localDate, rainByDate, t, type ClimateData, type MessageKey } from "@yvy/shared";
import { useOnline } from "../useOnline";

/** Registro de campo tal como lo devuelve /org/records. */
export interface Rec {
  id: string;
  kind: string;
  authorId: string;
  authorName: string | null;
  plotName: string | null;
  capturedAt: number;
  data: Record<string, unknown>;
}
interface TaskRow {
  status: string;
  completedAt: number | null;
  dueDate: string;
}
/** Aviso vigente de la estancia. */
export interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  summary: string;
  validFrom: number;
  validTo: number | null;
}
/** Período del parte, con los límites en milisegundos (hora de Paraguay). */
export interface Period {
  from: string;
  to: string;
  fromMs: number;
  toMs: number;
}

const HIGHLIGHT_KINDS = ["pest", "mortality", "theft"];
const DAY = 86_400_000;

/** `dd/mm` de una fecha ISO. */
export const ddmm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
/** `dd/mm/aaaa` de una fecha ISO. */
export const ddmmyyyy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Período válido (desde no posterior a hasta) o null. */
export function periodOf(from: string, to: string): Period | null {
  if (!from || !to || from > to) return null;
  return { from, to, fromMs: Date.parse(`${from}T00:00:00-03:00`), toMs: Date.parse(`${to}T23:59:59-03:00`) };
}

const sumOf = (m: Map<string, number>) => (m.size ? [...m.values()].reduce((a, b) => a + b, 0) : null);

/** Filas {label, value} ordenadas de mayor a menor a partir de un conteo. */
function sorted(m: Map<string, number>, label: (k: string) => string) {
  return [...m].map(([k, value]) => ({ label: label(k), value })).sort((a, b) => b.value - a.value);
}

/** Cantidad de registros por tipo y por autor. */
function recordCounts(rows: Rec[]) {
  const byKind = new Map<string, number>();
  const byAuthor = new Map<string, number>();
  for (const r of rows) {
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    const a = r.authorName ?? "—";
    byAuthor.set(a, (byAuthor.get(a) ?? 0) + 1);
  }
  return { byKind: sorted(byKind, (k) => t(`record-kinds.kind.${k}` as MessageKey)), byAuthor: sorted(byAuthor, (k) => k) };
}

/** Lluvia del satélite y del pluviómetro por día dentro del período. */
function rainModel(climate: ClimateData | null | undefined, p: Period | null) {
  const sat = rainByDate((climate?.daily ?? []).filter((d) => p && d.date >= p.from && d.date <= p.to));
  const gaugeByDay = new Map<string, number>();
  for (const g of (climate?.gauge ?? []).filter((x) => p && x.capturedAt >= p.fromMs && x.capturedAt <= p.toMs)) {
    const d = localDate(g.capturedAt);
    gaugeByDay.set(d, (gaugeByDay.get(d) ?? 0) + g.mm);
  }
  const rainDays: string[] = [];
  if (p) for (let d = p.from; d <= p.to && rainDays.length < 62; d = addDays(d, 1)) rainDays.push(d);
  return { satTotal: sumOf(sat), gaugeTotal: sumOf(gaugeByDay), rainDays, sat, gaugeByDay };
}

/** Consulta registros, lluvia, tareas y avisos de la estancia y los resume para el período. */
export function useReportData(farmId: string | undefined, period: Period | null, from: string, today: string) {
  const records = useOnline<{ rows: Rec[] }>(farmId && period ? `/org/records?farmId=${farmId}&from=${period.fromMs}&to=${period.toMs}&limit=500` : null);
  const days = Math.min(400, Math.max(30, Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from || today}T00:00:00Z`)) / DAY) + 2));
  const climate = useOnline<ClimateData>(farmId ? `/org/farms/${farmId}/climate?days=${days}` : null);
  const tasks = useOnline<TaskRow[]>(farmId ? `/org/tasks?farmId=${farmId}` : null);
  const alerts = useOnline<AlertRow[]>(farmId ? `/org/alerts?farmId=${farmId}` : null);

  const rows = records.data?.rows ?? [];
  const model = useMemo(() => ({ ...recordCounts(rows), ...rainModel(climate.data, period) }), [rows, climate.data, period?.from, period?.to]);
  const fromMs = period?.fromMs ?? 0;
  const toMs = period?.toMs ?? 0;
  const periodAlerts = (alerts.data ?? []).filter((a) => a.validFrom <= toMs && (a.validTo ?? a.validFrom) >= fromMs);
  const done = (tasks.data ?? []).filter((x) => x.status === "done" && x.completedAt !== null && x.completedAt >= fromMs && x.completedAt <= toMs).length;
  const late = (tasks.data ?? []).filter((x) => x.status === "open" && x.dueDate <= (period?.to ?? "") && x.dueDate < today).length;
  return {
    records,
    rows,
    model,
    periodAlerts,
    done,
    late,
    workers: new Set(rows.map((r) => r.authorId)).size,
    rain: model.satTotal ?? model.gaugeTotal,
    highlights: rows.filter((r) => HIGHLIGHT_KINDS.includes(r.kind)),
    hasRainDays: model.rainDays.some((d) => (model.sat.get(d) ?? 0) > 0 || (model.gaugeByDay.get(d) ?? 0) > 0),
  };
}

/** Datos del parte ya resumidos para el período elegido. */
export type ReportData = ReturnType<typeof useReportData>;
