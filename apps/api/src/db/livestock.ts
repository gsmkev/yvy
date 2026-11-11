/**
 * Hacienda calculada (ADR 0004, G-03): nunca se guarda un stock. Sale del último `herd_count` de cada potrero más
 * los `herd_move` y `mortality` posteriores (computeStock, en packages/shared). Un conteo nuevo corrige todo.
 * Presupuesto: 4 queries por estancia, sin importar la cantidad de potreros.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  computeStock,
  DEFAULT_MAX_UA_PER_HA,
  farmStock,
  uaOf,
  UA_EQUIVALENTS,
  type CountEvent,
  type FarmStockResponse,
  type PlotStockRow,
  type HerdCategory,
  type HerdCounts,
  type MortalityEvent,
  type MoveEvent,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, type ScopedDb } from "./scoped";

/** Tope de eventos que se leen por estancia (cuidado con los 10 ms de CPU del plan gratis). */
const MAX_EVENTS = 5000;

const parse = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

export async function getLivestockSettings(sdb: ScopedDb, farmId: string) {
  const [row] = await sdb.db
    .select({ maxUaPerHa: s.farmLivestockSettings.maxUaPerHa })
    .from(s.farmLivestockSettings)
    .where(and(eq(s.farmLivestockSettings.farmId, farmId), eq(s.farmLivestockSettings.organizationId, sdb.auth.orgId)))
    .limit(1);
  return { maxUaPerHa: row?.maxUaPerHa ?? DEFAULT_MAX_UA_PER_HA, isDefault: !row };
}

/** Solo dueño y administrador cambian la carga máxima (igual que los umbrales de avisos). */
export async function saveLivestockSettings(sdb: ScopedDb, farmId: string, maxUaPerHa: number) {
  sdb.require(can.alertSettings, "Solo el dueño o un administrador cambian la carga máxima");
  await sdb.requireFarm(farmId);
  const row = { maxUaPerHa, organizationId: sdb.auth.orgId, updatedAt: sdb.now(), updatedBy: sdb.auth.userId };
  await sdb.db
    .insert(s.farmLivestockSettings)
    .values({ farmId, ...row })
    .onConflictDoUpdate({ target: s.farmLivestockSettings.farmId, set: row });
}

export async function farmStockSummary(sdb: ScopedDb, farmId: string): Promise<FarmStockResponse> {
  // El stock mezcla registros de todos los potreros: solo quien ve todo (el empleado lo ve en su celular).
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const org = sdb.auth.orgId;
  const [plots, settings, countRows] = await Promise.all([
    sdb.db
      .select({ id: s.plots.id, name: s.plots.name, areaHa: s.plots.areaHa })
      .from(s.plots)
      .where(
        and(eq(s.plots.farmId, farmId), eq(s.plots.organizationId, org), eq(s.plots.kind, "pasture"), isNull(s.plots.deletedAt)),
      )
      .orderBy(asc(s.plots.name)),
    getLivestockSettings(sdb, farmId),
    // Último conteo de cada potrero (subconsulta por (potrero, máximo capturedAt)).
    sdb.db
      .select({ plotId: s.records.plotId, capturedAt: s.records.capturedAt, data: s.records.data })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, org),
          eq(s.records.farmId, farmId),
          eq(s.records.kind, "herd_count"),
          isNull(s.records.deletedAt),
          sql`${s.records.plotId} IS NOT NULL`,
          sql`${s.records.capturedAt} = (SELECT max(r2.captured_at) FROM records r2 WHERE r2.plot_id = ${s.records.plotId} AND r2.kind = 'herd_count' AND r2.deleted_at IS NULL)`,
        ),
      ),
  ]);
  const counts: CountEvent[] = [];
  for (const r of countRows) {
    const d = parse<{ counts?: HerdCounts }>(r.data);
    if (r.plotId && d?.counts) counts.push({ plotId: r.plotId, capturedAt: r.capturedAt, counts: d.counts });
  }
  // Eventos posteriores al conteo más viejo; si algún potrero nunca se contó, se leen todos.
  const counted = new Set(counts.map((c) => c.plotId));
  const since = plots.every((p) => counted.has(p.id)) && counts.length ? Math.min(...counts.map((c) => c.capturedAt)) : 0;
  const eventRows = await sdb.db
    .select({ kind: s.records.kind, plotId: s.records.plotId, capturedAt: s.records.capturedAt, data: s.records.data })
    .from(s.records)
    .where(
      and(
        eq(s.records.organizationId, org),
        eq(s.records.farmId, farmId),
        inArray(s.records.kind, ["herd_move", "mortality"]),
        isNull(s.records.deletedAt),
        sql`${s.records.capturedAt} >= ${since}`,
      ),
    )
    .limit(MAX_EVENTS + 1);
  const truncated = eventRows.length > MAX_EVENTS;
  const moves: MoveEvent[] = [];
  const deaths: MortalityEvent[] = [];
  for (const r of eventRows.slice(0, MAX_EVENTS)) {
    if (r.kind === "herd_move") {
      const d = parse<{ toPlotId?: string; counts?: HerdCounts }>(r.data);
      if (d?.counts)
        moves.push({ fromPlotId: r.plotId, toPlotId: d.toPlotId ?? null, capturedAt: r.capturedAt, counts: d.counts });
    } else if (r.plotId) {
      const d = parse<{ category?: HerdCategory; head?: number }>(r.data);
      if (d?.category && typeof d.head === "number")
        deaths.push({ plotId: r.plotId, capturedAt: r.capturedAt, category: d.category, head: d.head });
    }
  }
  const stock = computeStock(
    plots.map((p) => p.id),
    counts,
    moves,
    deaths,
  );
  const max = settings.maxUaPerHa;
  const rows: PlotStockRow[] = plots.map((p) => {
    const st = stock.get(p.id)!;
    const ua = uaOf(st.counts);
    const perHa = p.areaHa > 0 ? ua / p.areaHa : null;
    return {
      plotId: p.id,
      name: p.name,
      areaHa: p.areaHa,
      counts: st.counts,
      total: st.total,
      ua,
      uaPerHa: perHa,
      lastCountAt: st.lastCountAt,
      overLimit: perHa !== null && perHa > max,
    };
  });
  const f = farmStock(stock.values(), new Map(plots.map((p) => [p.id, p.areaHa])));
  return {
    maxUaPerHa: max,
    maxUaIsDefault: settings.isDefault,
    plots: rows,
    farm: { ...f, overLimit: f.uaPerHa !== null && f.uaPerHa > max },
    uaEquivalents: { ...UA_EQUIVALENTS },
    truncated,
  };
}
