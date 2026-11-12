/**
 * Costo por hectárea y por tonelada, y margen bruto por lote, cultivo y actividad (E-30, E-31).
 * Ingresos = ventas (cost_entries.category = "sale"); costos = el resto. Todo en guaraníes.
 * Cinco consultas agrupadas, sin recorrer filas en JS. El costo por kilo de carne (E-35) es el costo de ganadería sobre
 * los kilos vendidos en cattle_deals; no se valoriza la hacienda en pie, así que una compra pesa en el período en que se hace.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { costPerKgBeef, resultFigures, type Activity, type ResultFigures, type ResultInput } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, type ScopedDb } from "./scoped";

export type ResultRow = ResultInput & ResultFigures;

export async function results(sdb: ScopedDb, f: { farmId?: string; seasonId?: string }) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const ce = s.costEntries;
  const seasonOf = (col: unknown) => (f.seasonId ? sql`${col} = ${f.seasonId}` : undefined);
  const [groups, plots, harvests, plans, beefKg] = await Promise.all([
    sdb.db
      .select({
        plotId: ce.plotId,
        activity: ce.activity,
        costPyg: sql<number>`COALESCE(SUM(CASE WHEN ${ce.category} <> 'sale' THEN ${ce.amountPyg} END), 0)`,
        incomePyg: sql<number>`COALESCE(SUM(CASE WHEN ${ce.category} = 'sale' THEN ${ce.amountPyg} END), 0)`,
      })
      .from(ce)
      .where(
        and(
          eq(ce.organizationId, org),
          isNull(ce.deletedAt),
          f.farmId ? eq(ce.farmId, f.farmId) : undefined,
          f.seasonId ? eq(ce.seasonId, f.seasonId) : undefined,
        ),
      )
      .groupBy(ce.plotId, ce.activity),
    sdb.db
      .select({ id: s.plots.id, name: s.plots.name, farmId: s.plots.farmId, areaHa: s.plots.areaHa, crop: s.plots.crop })
      .from(s.plots)
      .where(and(eq(s.plots.organizationId, org), isNull(s.plots.deletedAt), f.farmId ? eq(s.plots.farmId, f.farmId) : undefined)),
    sdb.db
      .select({ plotId: s.records.plotId, tons: sql<number>`COALESCE(SUM(json_extract(${s.records.data}, '$.tons')), 0)` })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, org),
          eq(s.records.kind, "harvest"),
          isNull(s.records.deletedAt),
          f.farmId ? eq(s.records.farmId, f.farmId) : undefined,
          seasonOf(sql`json_extract(${s.records.data}, '$.seasonId')`),
        ),
      )
      .groupBy(s.records.plotId),
    f.seasonId
      ? sdb.db
          .select({ plotId: s.plotSeasons.plotId, crop: s.plotSeasons.crop })
          .from(s.plotSeasons)
          .where(and(eq(s.plotSeasons.organizationId, org), eq(s.plotSeasons.seasonId, f.seasonId), isNull(s.plotSeasons.deletedAt)))
      : Promise.resolve([] as { plotId: string; crop: string | null }[]),
    // Kilos de hacienda vendida (E-35): base del costo por kilo de carne.
    sdb.db
      .select({ kg: sql<number>`COALESCE(SUM(${s.cattleDeals.totalKg}), 0)` })
      .from(s.cattleDeals)
      .where(
        and(
          eq(s.cattleDeals.organizationId, org),
          eq(s.cattleDeals.kind, "sell"),
          isNull(s.cattleDeals.deletedAt),
          f.farmId ? eq(s.cattleDeals.farmId, f.farmId) : undefined,
          f.seasonId ? eq(s.cattleDeals.seasonId, f.seasonId) : undefined,
        ),
      ),
  ]);
  const planCrop = new Map(plans.map((p) => [p.plotId, p.crop]));
  const tonsOf = new Map(harvests.map((h) => [h.plotId, h.tons]));
  const plotInfo = new Map(plots.map((p) => [p.id, p]));

  const byPlotAcc = new Map<string | null, { costPyg: number; incomePyg: number }>();
  const byActivityAcc = new Map<Activity, { costPyg: number; incomePyg: number }>();
  for (const g of groups) {
    const p = byPlotAcc.get(g.plotId) ?? { costPyg: 0, incomePyg: 0 };
    p.costPyg += g.costPyg;
    p.incomePyg += g.incomePyg;
    byPlotAcc.set(g.plotId, p);
    const a = byActivityAcc.get(g.activity) ?? { costPyg: 0, incomePyg: 0 };
    a.costPyg += g.costPyg;
    a.incomePyg += g.incomePyg;
    byActivityAcc.set(g.activity, a);
  }
  // Lotes con costos, ventas o cosecha en el período (y los costos sin lote).
  const plotIds = new Set<string | null>([...byPlotAcc.keys(), ...harvests.map((h) => h.plotId)]);
  const mk = (plotId: string | null) => {
    const p = plotId ? plotInfo.get(plotId) : undefined;
    const acc = byPlotAcc.get(plotId) ?? { costPyg: 0, incomePyg: 0 };
    const areaHa = p?.areaHa ?? 0;
    const tons = tonsOf.get(plotId) ?? 0;
    return {
      plotId,
      name: p?.name ?? null,
      farmId: p?.farmId ?? null,
      crop: (plotId ? (planCrop.get(plotId) ?? p?.crop) : null) ?? null,
      ...acc,
      areaHa,
      tons,
      ...resultFigures({ ...acc, areaHa, tons }),
    };
  };
  const byPlot = [...plotIds].filter((id) => id === null || plotInfo.has(id)).map(mk).sort((a, b) => (a.name ?? "~").localeCompare(b.name ?? "~", "es"));

  const cropAcc = new Map<string, ResultInput>();
  for (const r of byPlot) {
    if (r.plotId === null) continue;
    const key = r.crop ?? "";
    const c = cropAcc.get(key) ?? { costPyg: 0, incomePyg: 0, areaHa: 0, tons: 0 };
    c.costPyg += r.costPyg;
    c.incomePyg += r.incomePyg;
    c.areaHa += r.areaHa;
    c.tons += r.tons;
    cropAcc.set(key, c);
  }
  const byCrop = [...cropAcc].map(([crop, c]) => ({ crop: crop || null, ...c, ...resultFigures(c) }));
  const byActivity = [...byActivityAcc].map(([activity, a]) => ({ activity, ...a, marginPyg: a.incomePyg - a.costPyg }));
  const totalCost = byPlot.reduce((x, r) => x + r.costPyg, 0);
  const totalIncome = byPlot.reduce((x, r) => x + r.incomePyg, 0);
  const area = byPlot.filter((r) => r.costPyg > 0 || r.incomePyg > 0 || r.tons > 0).reduce((x, r) => x + r.areaHa, 0);
  const tons = byPlot.reduce((x, r) => x + r.tons, 0);
  const totals: ResultRow = { costPyg: totalCost, incomePyg: totalIncome, areaHa: area, tons, ...resultFigures({ costPyg: totalCost, incomePyg: totalIncome, areaHa: area, tons }) };
  const livestock = byActivityAcc.get("ganaderia") ?? { costPyg: 0, incomePyg: 0 };
  const kg = beefKg[0]?.kg ?? 0;
  const beef = { kgSold: kg, costPyg: livestock.costPyg, incomePyg: livestock.incomePyg, costPerKgPyg: costPerKgBeef(livestock.costPyg, kg) };
  return { totals, byPlot, byCrop, byActivity, beef };
}
