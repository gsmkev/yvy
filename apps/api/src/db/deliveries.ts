/**
 * Entregas de grano a acopio (A-23): ticket, silo, humedad, descuentos y neto, por lote.
 * Solo la web las usa. Las ve y escribe quien edita el campo (no el empleado). El neto se calcula acá con grainNet.
 */
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { grainNet, newId, type CROPS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "./client";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export interface DeliveryInput {
  plotId: string | null;
  seasonId: string | null;
  crop: (typeof CROPS)[number];
  ticket: string;
  silo: string;
  deliveredOn: string;
  grossKg: number;
  moisturePct: number | null;
  baseMoisturePct: number;
  impuritiesPct: number;
  otherKg: number;
  note: string | null;
}

const MAX_PER_FARM = 5_000;

export async function listDeliveries(sdb: ScopedDb, farmId: string) {
  sdb.require(can.editField);
  await sdb.requireFarm(farmId);
  const org = sdb.auth.orgId;
  const [rows, harvests] = await Promise.all([
    sdb.db
      .select({
        id: s.grainDeliveries.id,
        plotId: s.grainDeliveries.plotId,
        plotName: s.plots.name,
        seasonId: s.grainDeliveries.seasonId,
        crop: s.grainDeliveries.crop,
        ticket: s.grainDeliveries.ticket,
        silo: s.grainDeliveries.silo,
        deliveredOn: s.grainDeliveries.deliveredOn,
        grossKg: s.grainDeliveries.grossKg,
        moisturePct: s.grainDeliveries.moisturePct,
        baseMoisturePct: s.grainDeliveries.baseMoisturePct,
        impuritiesPct: s.grainDeliveries.impuritiesPct,
        otherKg: s.grainDeliveries.otherKg,
        netKg: s.grainDeliveries.netKg,
        note: s.grainDeliveries.note,
      })
      .from(s.grainDeliveries)
      .leftJoin(s.plots, eq(s.plots.id, s.grainDeliveries.plotId))
      .where(
        and(
          eq(s.grainDeliveries.farmId, farmId),
          eq(s.grainDeliveries.organizationId, org),
          isNull(s.grainDeliveries.deletedAt),
        ),
      )
      .orderBy(desc(s.grainDeliveries.deliveredOn), desc(s.grainDeliveries.createdAt))
      .limit(1000),
    // Toneladas cosechadas por lote en los últimos 400 días, para cotejar con lo entregado
    sdb.db
      .select({
        plotId: s.records.plotId,
        tons: sql<number>`sum(json_extract(${s.records.data}, '$.tons'))`,
      })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, org),
          eq(s.records.farmId, farmId),
          eq(s.records.kind, "harvest"),
          isNotNull(s.records.plotId),
          isNull(s.records.deletedAt),
          gte(s.records.capturedAt, sdb.now() - 400 * 86_400_000),
        ),
      )
      .groupBy(s.records.plotId),
  ]);
  const harvestTons = new Map(harvests.map((h) => [h.plotId, Number(h.tons)]));
  const byPlot = new Map<string, { plotId: string; plotName: string; grossKg: number; netKg: number; deliveries: number }>();
  for (const r of rows) {
    if (!r.plotId) continue;
    const cur = byPlot.get(r.plotId) ?? { plotId: r.plotId, plotName: r.plotName ?? "", grossKg: 0, netKg: 0, deliveries: 0 };
    cur.grossKg += r.grossKg;
    cur.netKg += r.netKg;
    cur.deliveries++;
    byPlot.set(r.plotId, cur);
  }
  return {
    rows,
    byPlot: [...byPlot.values()].map((p) => ({
      ...p,
      grossKg: Math.round(p.grossKg),
      netKg: Math.round(p.netKg),
      harvestTons: harvestTons.get(p.plotId) ?? null,
    })),
  };
}

export async function createDelivery(sdb: ScopedDb, farmId: string, input: DeliveryInput) {
  sdb.require(can.editField);
  await sdb.requireFarm(farmId);
  const org = sdb.auth.orgId;
  if (input.plotId) {
    const [p] = await sdb.db
      .select({ id: s.plots.id })
      .from(s.plots)
      .where(and(eq(s.plots.id, input.plotId), eq(s.plots.farmId, farmId), eq(s.plots.organizationId, org), isNull(s.plots.deletedAt)))
      .limit(1);
    if (!p) throw new NotFoundError("Lote inexistente");
  }
  if (input.seasonId) {
    const [p] = await sdb.db
      .select({ id: s.seasons.id })
      .from(s.seasons)
      .where(and(eq(s.seasons.id, input.seasonId), eq(s.seasons.organizationId, org), isNull(s.seasons.deletedAt)))
      .limit(1);
    if (!p) throw new NotFoundError("Campaña inexistente");
  }
  const [n] = await sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.grainDeliveries)
    .where(and(eq(s.grainDeliveries.farmId, farmId), eq(s.grainDeliveries.organizationId, org), isNull(s.grainDeliveries.deletedAt)));
  if (Number(n?.n ?? 0) >= MAX_PER_FARM) throw new HTTPException(400, { message: "Demasiadas entregas en la estancia" });
  const { netKg } = grainNet(input);
  const id = newId();
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.grainDeliveries).values({
      ...input,
      id,
      organizationId: org,
      farmId,
      netKg,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
  return { id, netKg };
}

export async function deleteDelivery(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  const [row] = await sdb.db
    .select({ id: s.grainDeliveries.id })
    .from(s.grainDeliveries)
    .where(and(eq(s.grainDeliveries.id, id), eq(s.grainDeliveries.organizationId, sdb.auth.orgId), isNull(s.grainDeliveries.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.grainDeliveries)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.grainDeliveries.id, id), eq(s.grainDeliveries.organizationId, sdb.auth.orgId))),
  ]);
}
