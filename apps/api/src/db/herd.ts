/**
 * Ganadería, segunda tanda (gan-p2): consultas de estrés térmico, abigeato, suplementación, pesadas,
 * reproducción, rotación y oferta de pasto. Cada función hace pocas consultas (presupuesto D1) y pasa por ScopedDb.
 */
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
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
