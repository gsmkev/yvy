/** Resumen por estancia para la lista de estancias (área, lotes, registros de 7 días, avisos, último registro). Puro. */
export interface FarmSummary {
  id: string;
  name: string;
  areaHa: number;
  plots: number;
  records7d: number;
  alerts: number;
  lastRecordAt: number | null;
}

export const WEEK_MS = 7 * 86_400_000;

export function summarizeFarms(
  farms: { id: string; name: string; areaHa: number }[],
  plots: { farmId: string }[],
  records: { farmId: string; capturedAt: number }[],
  alerts: { farmId: string }[],
  now: number,
): FarmSummary[] {
  return farms
    .map((f) => {
      const recs = records.filter((r) => r.farmId === f.id);
      return {
        id: f.id,
        name: f.name,
        areaHa: f.areaHa,
        plots: plots.filter((p) => p.farmId === f.id).length,
        records7d: recs.filter((r) => r.capturedAt >= now - WEEK_MS).length,
        alerts: alerts.filter((a) => a.farmId === f.id).length,
        lastRecordAt: recs.reduce<number | null>((m, r) => (m === null || r.capturedAt > m ? r.capturedAt : m), null),
      };
    })
    .sort((a, b) => b.alerts - a.alerts || a.name.localeCompare(b.name, "es"));
}
