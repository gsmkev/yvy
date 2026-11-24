/** Tablero del dueño (R-06). */
import { sql } from "drizzle-orm";
import { isFieldRole, localDate } from "@yvy/shared";
import { can, type ScopedDb } from "../scoped";
import { dayOfYear } from "./climate";

// ---------- Tablero del dueño (R-06) ----------

/**
 * Cifras sueltas para el inicio del dueño con varias estancias: superficie por cultivo, lluvia del mes contra lo
 * normal, avisos activos, actividad del equipo en la semana y registros de la semana. 7 consultas agregadas,
 * sin recorrer estancia por estancia.
 */
export async function ownerDashboard(sdb: ScopedDb) {
  sdb.require(can.dashboard, "El tablero es para dueño y administrador");
  const org = sdb.auth.orgId;
  const now = sdb.now();
  const week = now - 7 * 86_400_000;
  const today = localDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  // K-05: el administrador con estancias limitadas ve el tablero de esas estancias
  const farmIds = sql`(SELECT id FROM farms WHERE organization_id = ${org} AND deleted_at IS NULL AND ${sdb.farmScopeSql("farms.id") ?? sql`1`})`;
  const [byCrop, rain, normal, alerts, members, records] = await Promise.all([
    sdb.db.all<{ crop: string | null; kind: string; ha: number; plots: number }>(sql`
      SELECT crop, kind, sum(area_ha) AS ha, count(*) AS plots FROM plots
      WHERE organization_id = ${org} AND deleted_at IS NULL AND farm_id IN ${farmIds}
      GROUP BY crop, kind ORDER BY ha DESC`),
    // Lluvia del mes por estancia (promedio entre fuentes de un mismo día para no contar dos veces)
    sdb.db.all<{ farm_id: string; mm: number }>(sql`
      SELECT farm_id, sum(p) AS mm FROM (
        SELECT farm_id, date, avg(precip_mm) AS p FROM climate_daily
        WHERE plot_id = '' AND date >= ${monthStart} AND date <= ${today} AND precip_mm IS NOT NULL AND farm_id IN ${farmIds}
        GROUP BY farm_id, date) GROUP BY farm_id`),
    sdb.db.all<{ farm_id: string; mm: number }>(sql`
      SELECT farm_id, sum(mean) AS mm FROM climatology
      WHERE plot_id = '' AND var = 'precip' AND mean IS NOT NULL AND farm_id IN ${farmIds}
        AND day_of_year BETWEEN ${dayOfYear(monthStart)} AND ${dayOfYear(today)}
      GROUP BY farm_id`),
    sdb.db.all<{ kind: string; severity: string; n: number }>(sql`
      SELECT kind, severity, count(*) AS n FROM alerts
      WHERE organization_id = ${org} AND resolved_at IS NULL AND (valid_to IS NULL OR valid_to >= ${now}) AND farm_id IN ${farmIds}
      GROUP BY kind, severity`),
    sdb.db.all<{ role: string; total: number; active: number }>(sql`
      SELECT m.role, count(*) AS total,
        sum(EXISTS (SELECT 1 FROM activity_daily a WHERE a.user_id = m.user_id AND a.organization_id = ${org} AND a.day >= ${localDate(week)})) AS active
      FROM memberships m WHERE m.organization_id = ${org} AND m.deleted_at IS NULL AND m.status = 'active' GROUP BY m.role`),
    sdb.db.all<{ kind: string; n: number; byWorkers: number }>(sql`
      SELECT r.kind, count(*) AS n,
        sum(EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = r.author_id AND m.organization_id = ${org} AND m.role = 'worker')) AS byWorkers
      FROM records r WHERE r.organization_id = ${org} AND r.deleted_at IS NULL AND r.captured_at >= ${week} AND r.farm_id IN ${farmIds} GROUP BY r.kind ORDER BY n DESC`),
  ]);
  // Lluvia: solo estancias con dato real y normal a la vez, así la comparación es entre lo mismo
  const normalBy = new Map(normal.map((r) => [r.farm_id, Number(r.mm)]));
  const both = rain.filter((r) => normalBy.has(r.farm_id));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const rainMm = avg(both.map((r) => Number(r.mm)));
  const normalMm = avg(both.map((r) => normalBy.get(r.farm_id)!));
  const workers = members.find((m) => m.role === "worker");
  // Margen de los últimos 12 meses (ventas menos costos, en Gs.). Son montos: solo con el permiso del ERP.
  let margin: { incomePyg: number; costPyg: number; marginPyg: number; entries: number; sinceMs: number } | null = null;
  if (can.manageErp(sdb.auth.role)) {
    const sinceMs = now - 365 * 86_400_000;
    const farmScope = sdb.farmScopeSql("cost_entries.farm_id");
    const [m] = await sdb.db.all<{ income: number; cost: number; n: number }>(sql`
      SELECT coalesce(sum(CASE WHEN category = 'sale' THEN amount_pyg END), 0) AS income,
        coalesce(sum(CASE WHEN category <> 'sale' THEN amount_pyg END), 0) AS cost, count(*) AS n
      FROM cost_entries
      WHERE organization_id = ${org} AND deleted_at IS NULL AND occurred_at >= ${sinceMs} AND ${farmScope ?? sql`1`}`);
    const income = Number(m?.income ?? 0);
    const cost = Number(m?.cost ?? 0);
    margin = { incomePyg: income, costPyg: cost, marginPyg: income - cost, entries: Number(m?.n ?? 0), sinceMs };
  }
  return {
    generatedAt: now,
    margin,
    areaByCrop: byCrop.map((r) => ({ crop: r.crop, kind: r.kind, ha: Number(r.ha), plots: Number(r.plots) })),
    rain: {
      month: monthStart.slice(0, 7),
      farmsWithData: both.length,
      mm: rainMm,
      normalMm,
      pctOfNormal: rainMm !== null && normalMm ? Math.round((100 * rainMm) / normalMm) : null,
    },
    alerts: {
      total: alerts.reduce((a, r) => a + Number(r.n), 0),
      byKind: alerts.map((r) => ({ kind: r.kind, severity: r.severity, n: Number(r.n) })),
    },
    activity: {
      workers: Number(workers?.total ?? 0),
      activeWorkers7d: Number(workers?.active ?? 0),
      staff: members.filter((m) => !isFieldRole(m.role)).reduce((a, m) => a + Number(m.total), 0),
      activeStaff7d: members.filter((m) => !isFieldRole(m.role)).reduce((a, m) => a + Number(m.active), 0),
    },
    records7d: {
      total: records.reduce((a, r) => a + Number(r.n), 0),
      byWorkers: records.reduce((a, r) => a + Number(r.byWorkers), 0),
      byKind: records.map((r) => ({ kind: r.kind, n: Number(r.n) })),
    },
  };
}
