/**
 * Presupuesto de campaña frente a lo real (E-32). Lo real sale de cost_entries de la campaña, agrupado por lote,
 * actividad y rubro: cuatro consultas, sin recorrer filas sueltas. Solo dueño y administrador (son montos).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { budgetVsActual, type Activity, type CostCategory } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requireOwned } from "./erp";
import { can, type ScopedDb } from "./scoped";

export async function budgetCompare(sdb: ScopedDb, seasonId: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  await requireOwned(sdb, s.seasons, seasonId, "La campaña");
  const ce = s.costEntries;
  const [lines, actual, plans, plots] = await Promise.all([
    sdb.db
      .select()
      .from(s.budgetLines)
      .where(and(eq(s.budgetLines.organizationId, org), eq(s.budgetLines.seasonId, seasonId), isNull(s.budgetLines.deletedAt))),
    sdb.db
      .select({ plotId: ce.plotId, activity: ce.activity, category: ce.category, amountPyg: sql<number>`SUM(${ce.amountPyg})` })
      .from(ce)
      .where(and(eq(ce.organizationId, org), eq(ce.seasonId, seasonId), isNull(ce.deletedAt)))
      .groupBy(ce.plotId, ce.activity, ce.category),
    sdb.db
      .select({ plotId: s.plotSeasons.plotId, crop: s.plotSeasons.crop })
      .from(s.plotSeasons)
      .where(and(eq(s.plotSeasons.organizationId, org), eq(s.plotSeasons.seasonId, seasonId), isNull(s.plotSeasons.deletedAt))),
    sdb.db
      .select({ id: s.plots.id, name: s.plots.name, crop: s.plots.crop })
      .from(s.plots)
      .where(and(eq(s.plots.organizationId, org), isNull(s.plots.deletedAt))),
  ]);
  const cropOf = new Map<string, string | null>(plots.map((p) => [p.id, p.crop]));
  for (const p of plans) if (p.crop) cropOf.set(p.plotId, p.crop);
  const rows = budgetVsActual(
    lines.map((l) => ({ id: l.id, plotId: l.plotId, crop: l.crop, activity: l.activity as Activity | null, category: l.category as CostCategory, amountPyg: l.amountPyg })),
    actual.map((a) => ({ plotId: a.plotId, activity: a.activity, category: a.category, amountPyg: a.amountPyg })),
    cropOf,
  );
  const sum = (income: boolean, f: (r: (typeof rows)[number]) => number) => rows.filter((r) => (r.category === "sale") === income).reduce((x, r) => x + f(r), 0);
  const plotName = new Map(plots.map((p) => [p.id, p.name]));
  return {
    rows: rows.map((r) => ({ ...r, plotName: r.plotId ? (plotName.get(r.plotId) ?? null) : null })),
    totals: {
      costPlannedPyg: sum(false, (r) => r.amountPyg),
      costActualPyg: sum(false, (r) => r.actualPyg),
      incomePlannedPyg: sum(true, (r) => r.amountPyg),
      incomeActualPyg: sum(true, (r) => r.actualPyg),
    },
  };
}
