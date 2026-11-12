/**
 * Ganadería, segunda tanda (gan-p2): consultas de estrés térmico, abigeato, suplementación, pesadas,
 * reproducción, rotación y oferta de pasto. Cada función hace pocas consultas (presupuesto D1) y pasa por ScopedDb.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  emptyCounts,
  HEAT_ALERT,
  HEAT_THRESHOLDS,
  heatHours,
  summarizeHeat,
  type FarmHeatStressResponse,
  type HerdCategory,
  type SupplementEvent,
  type SupplementResponse,
  type SupplementType,
  type TheftResponse,
  MINERAL_SALT_REFERENCE_G,
  summarizeSupplements,
  estimateForage,
  paddockTimelines,
  rotationPlan,
  ROTATION_DEFAULTS,
  FORAGE,
  type ForageResponse,
  type HerdCounts,
  type HerdEvent,
  type PastureCover,
  type PastureReading,
  type RotationResponse,
  reproIndices,
  type ReproEvent,
  type ReproductionResponse,
  type ServiceMethod,
  groupWeighings,
  type WeighingEvent,
  type WeighingsResponse,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { farmStockSummary } from "./livestock";
import { can, type ScopedDb } from "./scoped";

/** G-32: THI de las próximas 48 horas con el pronóstico horario guardado (MET Norway). */
export async function farmHeatStress(sdb: ScopedDb, farmId: string): Promise<FarmHeatStressResponse> {
  await sdb.requireFarmVisible(farmId);
  const now = sdb.now();
  const from = now - (now % 3_600_000);
  const rows = await sdb.db
    .select({ validAt: s.forecastHours.validAt, tempC: s.forecastHours.tempC, humidityPct: s.forecastHours.humidityPct })
    .from(s.forecastHours)
    .where(and(eq(s.forecastHours.farmId, farmId), gte(s.forecastHours.validAt, from)))
    .orderBy(asc(s.forecastHours.validAt))
    .limit(HEAT_ALERT.windowHours);
  const hours = heatHours(rows);
  return {
    hours,
    summary: summarizeHeat(hours, from),
    thresholds: HEAT_THRESHOLDS,
    windowHours: HEAT_ALERT.windowHours,
  };
}

const parse = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const DAY = 86_400_000;
/** Tope de filas que se leen por consulta (10 ms de CPU del plan gratis). */
const MAX_ROWS = 500;

/** Rango de fechas de los listados: por defecto, el último año. */
export function rangeOf(sdb: ScopedDb, from?: number, to?: number) {
  const end = to ?? sdb.now();
  return { from: from ?? end - 365 * DAY, to: end };
}

/** G-13: avisos de abigeato de la estancia con total de cabezas y cuáles no tienen denuncia. */
export async function farmTheft(sdb: ScopedDb, farmId: string, from?: number, to?: number): Promise<TheftResponse> {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const range = rangeOf(sdb, from, to);
  const rows = await sdb.db
    .select({
      id: s.records.id,
      plotId: s.records.plotId,
      plotName: s.plots.name,
      capturedAt: s.records.capturedAt,
      data: s.records.data,
    })
    .from(s.records)
    .leftJoin(s.plots, eq(s.plots.id, s.records.plotId))
    .where(
      and(
        eq(s.records.organizationId, sdb.auth.orgId),
        eq(s.records.farmId, farmId),
        eq(s.records.kind, "theft"),
        isNull(s.records.deletedAt),
        gte(s.records.capturedAt, range.from),
        lte(s.records.capturedAt, range.to),
      ),
    )
    .orderBy(desc(s.records.capturedAt))
    .limit(MAX_ROWS + 1);
  const byCategory = emptyCounts();
  const out: TheftResponse["rows"] = [];
  let withoutReport = 0;
  for (const r of rows.slice(0, MAX_ROWS)) {
    const d = parse<{ category?: HerdCategory; head?: number; reportedAt?: number; policeReport?: string; note?: string }>(r.data);
    if (!d?.category || typeof d.head !== "number") continue;
    byCategory[d.category] += d.head;
    if (!d.policeReport) withoutReport++;
    out.push({
      id: r.id,
      plotId: r.plotId,
      plotName: r.plotName,
      capturedAt: r.capturedAt,
      category: d.category,
      head: d.head,
      reportedAt: d.reportedAt ?? null,
      policeReport: d.policeReport ?? null,
      note: d.note ?? null,
    });
  }
  return {
    ...range,
    rows: out,
    totals: { head: out.reduce((n, r) => n + r.head, 0), byCategory, withoutReport },
    truncated: rows.length > MAX_ROWS,
  };
}

/**
 * G-31: suplementación y sal mineral por potrero en una ventana (por defecto, los últimos 30 días).
 * El consumo por cabeza usa la hacienda de hoy (stock calculado), por eso es aproximado.
 */
export async function farmSupplements(sdb: ScopedDb, farmId: string, from?: number, to?: number): Promise<SupplementResponse> {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const end = to ?? sdb.now();
  const range = { from: from ?? end - 30 * DAY, to: end };
  const [stock, rows] = await Promise.all([
    farmStockSummary(sdb, farmId),
    sdb.db
      .select({ plotId: s.records.plotId, capturedAt: s.records.capturedAt, data: s.records.data })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, sdb.auth.orgId),
          eq(s.records.farmId, farmId),
          eq(s.records.kind, "supplement"),
          isNull(s.records.deletedAt),
          gte(s.records.capturedAt, range.from),
          lte(s.records.capturedAt, range.to),
        ),
      )
      .limit(MAX_ROWS * 4 + 1),
  ]);
  const events: SupplementEvent[] = [];
  for (const r of rows.slice(0, MAX_ROWS * 4)) {
    const d = parse<{ type?: SupplementType; kg?: number }>(r.data);
    if (r.plotId && d?.type && typeof d.kg === "number") events.push({ plotId: r.plotId, capturedAt: r.capturedAt, type: d.type, kg: d.kg });
  }
  const sum = summarizeSupplements(
    stock.plots.map((p) => ({ plotId: p.plotId, name: p.name, head: p.total })),
    events,
    range.from,
    range.to,
  );
  return { ...range, ...sum, reference: MINERAL_SALT_REFERENCE_G, truncated: rows.length > MAX_ROWS * 4 };
}

/** G-22: pesadas y ganancia diaria de peso por lote de animales y por animal con caravana. */
export async function farmWeighings(sdb: ScopedDb, farmId: string, from?: number, to?: number): Promise<WeighingsResponse> {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const range = rangeOf(sdb, from, to);
  const rows = await sdb.db
    .select({ capturedAt: s.records.capturedAt, data: s.records.data })
    .from(s.records)
    .where(
      and(
        eq(s.records.organizationId, sdb.auth.orgId),
        eq(s.records.farmId, farmId),
        eq(s.records.kind, "weighing"),
        isNull(s.records.deletedAt),
        gte(s.records.capturedAt, range.from),
        lte(s.records.capturedAt, range.to),
      ),
    )
    .orderBy(desc(s.records.capturedAt))
    .limit(MAX_ROWS * 2 + 1);
  const events: WeighingEvent[] = [];
  for (const r of rows.slice(0, MAX_ROWS * 2)) {
    const d = parse<{ kg?: number; head?: number; group?: string; tag?: string }>(r.data);
    if (typeof d?.kg !== "number") continue;
    events.push({ capturedAt: r.capturedAt, kg: d.kg, head: d.head ?? 1, group: d.group ?? null, tag: d.tag ?? null });
  }
  return { ...range, ...groupWeighings(events), truncated: rows.length > MAX_ROWS * 2 };
}

/** G-20: eventos de reproducción del período e índices de preñez, parición y destete. */
export async function farmReproduction(sdb: ScopedDb, farmId: string, from?: number, to?: number): Promise<ReproductionResponse> {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const range = rangeOf(sdb, from, to);
  const rows = await sdb.db
    .select({
      id: s.records.id,
      plotId: s.records.plotId,
      plotName: s.plots.name,
      capturedAt: s.records.capturedAt,
      data: s.records.data,
    })
    .from(s.records)
    .leftJoin(s.plots, eq(s.plots.id, s.records.plotId))
    .where(
      and(
        eq(s.records.organizationId, sdb.auth.orgId),
        eq(s.records.farmId, farmId),
        eq(s.records.kind, "reproduction"),
        isNull(s.records.deletedAt),
        gte(s.records.capturedAt, range.from),
        lte(s.records.capturedAt, range.to),
      ),
    )
    .orderBy(desc(s.records.capturedAt))
    .limit(MAX_ROWS * 2 + 1);
  const out: ReproductionResponse["rows"] = [];
  for (const r of rows.slice(0, MAX_ROWS * 2)) {
    const d = parse<{ event?: ReproEvent; head?: number; method?: ServiceMethod; pregnant?: number; calves?: number; tag?: string }>(r.data);
    if (!d?.event || typeof d.head !== "number") continue;
    out.push({
      id: r.id,
      plotId: r.plotId,
      plotName: r.plotName,
      capturedAt: r.capturedAt,
      event: d.event,
      head: d.head,
      method: d.method ?? null,
      pregnant: d.pregnant ?? null,
      calves: d.calves ?? null,
      tag: d.tag ?? null,
    });
  }
  return {
    ...range,
    indices: reproIndices(out.map((r) => ({ event: r.event, head: r.head, pregnant: r.pregnant ?? undefined, calves: r.calves ?? undefined }))),
    rows: out.slice(0, 50),
    truncated: rows.length > MAX_ROWS * 2,
  };
}

/** Última medición de pasto (`pasture_status`) de cada potrero de la estancia (1 consulta). */
async function latestPastureReadings(sdb: ScopedDb, farmId: string): Promise<Map<string, PastureReading>> {
  const rows = await sdb.db
    .select({ plotId: s.records.plotId, capturedAt: s.records.capturedAt, data: s.records.data })
    .from(s.records)
    .where(
      and(
        eq(s.records.organizationId, sdb.auth.orgId),
        eq(s.records.farmId, farmId),
        eq(s.records.kind, "pasture_status"),
        isNull(s.records.deletedAt),
        sql`${s.records.plotId} IS NOT NULL`,
        sql`${s.records.capturedAt} = (SELECT max(r2.captured_at) FROM records r2 WHERE r2.plot_id = ${s.records.plotId} AND r2.kind = 'pasture_status' AND r2.deleted_at IS NULL)`,
      ),
    );
  const out = new Map<string, PastureReading>();
  for (const r of rows) {
    const d = parse<{ heightCm?: number; cover?: PastureCover }>(r.data);
    if (r.plotId && typeof d?.heightCm === "number" && d.cover && !out.has(r.plotId))
      out.set(r.plotId, { heightCm: d.heightCm, cover: d.cover, at: r.capturedAt });
  }
  return out;
}

/**
 * G-04: días de ocupación y descanso de cada potrero (reconstruidos del último año de conteos, movimientos,
 * mortandad y abigeato) y próximo potrero sugerido. 3 consultas por estancia.
 */
export async function farmRotation(sdb: ScopedDb, farmId: string): Promise<RotationResponse> {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const org = sdb.auth.orgId;
  const now = sdb.now();
  const [plots, events, readings] = await Promise.all([
    sdb.db
      .select({ id: s.plots.id, name: s.plots.name, areaHa: s.plots.areaHa })
      .from(s.plots)
      .where(and(eq(s.plots.farmId, farmId), eq(s.plots.organizationId, org), eq(s.plots.kind, "pasture"), isNull(s.plots.deletedAt)))
      .orderBy(asc(s.plots.name)),
    sdb.db
      .select({ kind: s.records.kind, plotId: s.records.plotId, capturedAt: s.records.capturedAt, data: s.records.data })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, org),
          eq(s.records.farmId, farmId),
          inArray(s.records.kind, ["herd_count", "herd_move", "mortality", "theft"]),
          isNull(s.records.deletedAt),
          gte(s.records.capturedAt, now - 365 * DAY),
        ),
      )
      .orderBy(desc(s.records.capturedAt))
      .limit(5001),
    latestPastureReadings(sdb, farmId),
  ]);
  const evs: HerdEvent[] = [];
  for (const r of events.slice(0, 5000)) {
    const d = parse<{ counts?: HerdCounts; toPlotId?: string; category?: HerdCategory; head?: number }>(r.data);
    if (!d) continue;
    if (r.kind === "herd_count" && r.plotId && d.counts) evs.push({ at: r.capturedAt, type: "count", plotId: r.plotId, counts: d.counts });
    else if (r.kind === "herd_move" && d.counts)
      evs.push({ at: r.capturedAt, type: "move", fromPlotId: r.plotId, toPlotId: d.toPlotId ?? null, counts: d.counts });
    else if ((r.kind === "mortality" || r.kind === "theft") && r.plotId && d.category && typeof d.head === "number")
      evs.push({ at: r.capturedAt, type: "loss", plotId: r.plotId, category: d.category, head: d.head });
  }
  const timelines = paddockTimelines(plots.map((p) => p.id), evs, now);
  const plan = rotationPlan(plots.map((p) => ({ plotId: p.id, name: p.name, areaHa: p.areaHa })), timelines, readings, now);
  return { defaults: ROTATION_DEFAULTS, ...plan, truncated: events.length > 5000 };
}

/**
 * G-05: oferta de forraje (kg de materia seca por hectárea) de cada potrero con la última altura y cobertura
 * medidas y el último NDVI de satélite, y días de pasto con la hacienda de hoy. 6 consultas por estancia.
 */
export async function farmForage(sdb: ScopedDb, farmId: string): Promise<ForageResponse> {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const now = sdb.now();
  const [stock, readings, ndviRows] = await Promise.all([
    farmStockSummary(sdb, farmId),
    latestPastureReadings(sdb, farmId),
    sdb.db
      .select({ plotId: s.plotIndexStats.plotId, mean: s.plotIndexStats.mean, acquiredAt: s.plotIndexStats.acquiredAt })
      .from(s.plotIndexStats)
      .where(
        and(
          eq(s.plotIndexStats.organizationId, sdb.auth.orgId),
          eq(s.plotIndexStats.idx, "ndvi"),
          isNull(s.plotIndexStats.deletedAt),
          sql`${s.plotIndexStats.plotId} IN (SELECT id FROM plots WHERE farm_id = ${farmId} AND kind = 'pasture' AND deleted_at IS NULL)`,
          sql`${s.plotIndexStats.acquiredAt} = (SELECT max(p2.acquired_at) FROM plot_index_stats p2 WHERE p2.plot_id = ${s.plotIndexStats.plotId} AND p2.idx = 'ndvi' AND p2.deleted_at IS NULL)`,
        ),
      ),
  ]);
  const ndvi = new Map(ndviRows.map((r) => [r.plotId, r] as const));
  return {
    coefficients: FORAGE,
    plots: stock.plots.map((p) => {
      const h = readings.get(p.plotId);
      const n = ndvi.get(p.plotId);
      const est = estimateForage({
        heightCm: h?.heightCm ?? null,
        cover: h?.cover ?? null,
        heightAt: h?.at ?? null,
        ndvi: n?.mean ?? null,
        ndviAt: n?.acquiredAt ?? null,
        areaHa: p.areaHa,
        ua: p.ua,
        now,
      });
      return {
        plotId: p.plotId,
        name: p.name,
        areaHa: p.areaHa,
        head: p.total,
        ua: Math.round(p.ua * 10) / 10,
        heightCm: h?.heightCm ?? null,
        cover: h?.cover ?? null,
        heightAt: h?.at ?? null,
        ndvi: n ? Math.round(n.mean * 100) / 100 : null,
        ndviAt: n?.acquiredAt ?? null,
        ...est,
      };
    }),
  };
}
