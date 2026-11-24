import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, localDate } from "@yvy/shared";
import { get } from "../../lib/api";
import { tk } from "../../lib/i18n";
import { fetchAllRecords, useAlerts, useFarm, useTasks } from "../../lib/queries";

/** Tipos que conviene mirar primero en el parte. */
const HIGHLIGHT_KINDS = ["pest", "mortality", "theft"];
const DAY = 86_400_000;

/** Registros del período agrupados por tipo y por autor, ordenados de mayor a menor. */
function groupCounts(rows: { kind: string; authorName: string | null }[]) {
  const count = (key: (r: { kind: string; authorName: string | null }) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return m;
  };
  const sorted = (m: Map<string, number>, label: (k: string) => string) =>
    [...m].map(([k, value]) => ({ label: label(k), value })).sort((a, b) => b.value - a.value);
  return {
    byKind: sorted(count((r) => r.kind), (k) => tk(`recordKinds.${k}`)),
    byAuthor: sorted(count((r) => r.authorName ?? "—"), (k) => k),
  };
}

/** Lluvia del período: satélite (CHIRPS gana sobre el resto) y pluviómetro, por día. */
function rainOf(
  climate: { daily: { date: string; source: string; precipMm: number | null }[]; gauge: { capturedAt: number; mm: number }[] } | undefined,
  from: string,
  to: string,
  fromMs: number,
  toMs: number,
) {
  const byDate = new Map<string, number>();
  for (const d of climate?.daily ?? []) {
    if (d.date < from || d.date > to || d.precipMm === null) continue;
    if (d.source === "chirps" || !byDate.has(d.date)) byDate.set(d.date, d.precipMm);
  }
  const weekRain = byDate.size ? [...byDate.values()].reduce((a, b) => a + b, 0) : null;
  const gauge = (climate?.gauge ?? []).filter((g) => g.capturedAt >= fromMs && g.capturedAt <= toMs);
  const gaugeTotal = gauge.length ? gauge.reduce((a, g) => a + g.mm, 0) : null;
  const gaugeByDay = new Map<string, number>();
  for (const g of gauge) {
    const d = localDate(g.capturedAt);
    gaugeByDay.set(d, (gaugeByDay.get(d) ?? 0) + g.mm);
  }
  const rainDays: { date: string; mm: number | null; gauge: number | null }[] = [];
  for (let d = from; d <= to && rainDays.length < 62; d = addDays(d, 1)) {
    rainDays.push({ date: d, mm: byDate.get(d) ?? null, gauge: gaugeByDay.get(d) ?? null });
  }
  const hasRainDays = rainDays.some((d) => (d.mm ?? 0) > 0 || (d.gauge ?? 0) > 0);
  return { weekRain, gaugeTotal, rainDays, hasRainDays };
}

/** Datos del parte de la estancia entre `from` y `to` (fechas ISO): registros, lluvia, alertas y tareas. */
export function useReportData(farmId: string, from: string, to: string) {
  const today = localDate(Date.now());
  const farm = useFarm(farmId);
  const alerts = useAlerts({ farmId });
  const tasks = useTasks({ farmId });
  const fromMs = Date.parse(`${from}T00:00:00-03:00`);
  const toMs = Date.parse(`${to}T23:59:59-03:00`);
  const records = useQuery({
    queryKey: ["report-records", farmId, from, to],
    queryFn: () => fetchAllRecords({ farmId, from: fromMs, to: toMs }, 2000),
  });
  const climateDays = Math.min(400, Math.max(30, Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 2));
  const climate = useQuery({
    queryKey: ["climate", farmId, climateDays],
    queryFn: () =>
      get<{
        daily: { date: string; source: string; precipMm: number | null }[];
        gauge: { capturedAt: number; mm: number }[];
      }>(`/org/farms/${farmId}/climate?days=${climateDays}`),
  });
  const rows = records.data ?? [];
  const { byKind, byAuthor } = useMemo(() => groupCounts(rows), [rows]);
  const rain = rainOf(climate.data, from, to, fromMs, toMs);
  const periodAlerts = (alerts.data ?? []).filter((a) => a.validFrom <= toMs && (a.validTo ?? a.validFrom) >= fromMs);
  const tasksDone = (tasks.data ?? []).filter((x) => x.status === "done" && x.completedAt !== null && x.completedAt >= fromMs && x.completedAt <= toMs).length;
  const tasksLate = (tasks.data ?? []).filter((x) => x.status === "open" && x.dueDate <= to && x.dueDate < today).length;
  return {
    today,
    farm,
    records,
    rows,
    byKind,
    byAuthor,
    ...rain,
    periodAlerts,
    tasksDone,
    tasksLate,
    highlights: rows.filter((r) => HIGHLIGHT_KINDS.includes(r.kind)),
    workers: new Set(rows.map((r) => r.authorId)).size,
  };
}
export type ReportData = ReturnType<typeof useReportData>;
