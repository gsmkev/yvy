/**
 * Venta de granos (E-34): contratos, entregas (ticket de balanza) y liquidaciones. Una liquidación es un ingreso
 * (cost_entries categoría `sale`, con toneladas, así el margen por tonelada sale solo) y una cuenta a cobrar (E-36).
 * Todo son montos: solo dueño y administrador. La entrega no cobra nada: lo cobrable es la liquidación.
 *
 * Las entregas viven en la tabla `grain_deliveries` de A-23 (entregas de grano a silos y acopios), con `contract_id`
 * apuntando al contrato. Una entrega a un contrato es una entrega a acopio como cualquier otra (aparece en la
 * pestaña Entregas de la estancia) que además suma al avance del contrato. Acá las toneladas son netas: el neto
 * de la fila es esa cantidad y no se aplican descuentos de balanza (los descuentos van en la liquidación).
 */
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { BASE_MOISTURE_PCT, contractProgress, CROPS, LIMITS, newId, noonAsuncion, settlementNet, type Currency } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "./client";
import { pygOf, resolveCenter } from "./costs";
import { requireOwned } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";

async function contract(sdb: ScopedDb, id: string) {
  const [c] = await sdb.db
    .select()
    .from(s.grainContracts)
    .where(and(eq(s.grainContracts.id, id), eq(s.grainContracts.organizationId, sdb.auth.orgId), isNull(s.grainContracts.deletedAt)))
    .limit(1);
  if (!c) throw new NotFoundError("El contrato no existe");
  return c;
}

/** Contratos con lo entregado y lo liquidado. Tres consultas. */
export async function contractsSummary(sdb: ScopedDb) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const [contracts, delivered, settled] = await Promise.all([
    sdb.db
      .select()
      .from(s.grainContracts)
      .where(and(eq(s.grainContracts.organizationId, org), isNull(s.grainContracts.deletedAt)))
      .orderBy(desc(s.grainContracts.createdAt)),
    sdb.db
      .select({ contractId: s.grainDeliveries.contractId, tons: sql<number>`SUM(${s.grainDeliveries.netKg}) / 1000.0` })
      .from(s.grainDeliveries)
      .where(and(eq(s.grainDeliveries.organizationId, org), isNull(s.grainDeliveries.deletedAt), isNotNull(s.grainDeliveries.contractId)))
      .groupBy(s.grainDeliveries.contractId),
    sdb.db
      .select({ contractId: s.grainSettlements.contractId, tons: sql<number>`SUM(${s.grainSettlements.tons})`, net: sql<number>`SUM(${s.grainSettlements.netAmount})`, paid: sql<number>`SUM(${s.grainSettlements.paidAmount})` })
      .from(s.grainSettlements)
      .where(and(eq(s.grainSettlements.organizationId, org), isNull(s.grainSettlements.deletedAt)))
      .groupBy(s.grainSettlements.contractId),
  ]);
  return contracts.map((c) => {
    const d = delivered.find((x) => x.contractId === c.id)?.tons ?? 0;
    const st = settled.find((x) => x.contractId === c.id);
    return { ...c, ...contractProgress(c.tons, d, st?.tons ?? 0), settledAmount: st?.net ?? 0, paidAmount: st?.paid ?? 0 };
  });
}

export async function checkContractRefs(sdb: ScopedDb, v: { partyId?: unknown; seasonId?: unknown }) {
  if (typeof v.partyId === "string") await requireOwned(sdb, s.parties, v.partyId, "El comprador");
  if (typeof v.seasonId === "string") await requireOwned(sdb, s.seasons, v.seasonId, "La campaña");
}

/** Forma de entrega de E-34 sobre la fila de A-23: toneladas netas, destino = silo. */
const asDelivery = (r: {
  id: string;
  contractId: string | null;
  deliveredOn: string;
  netKg: number;
  plotId: string | null;
  ticket: string;
  silo: string;
  moisturePct: number | null;
}) => ({
  id: r.id,
  contractId: r.contractId,
  date: r.deliveredOn,
  tons: Math.round(r.netKg) / 1000,
  plotId: r.plotId,
  ticket: r.ticket === NO_TICKET ? null : r.ticket,
  destination: r.silo === NO_SILO ? null : r.silo,
  moisturePct: r.moisturePct,
});
const NO_TICKET = "s/n";
const NO_SILO = "—";

export async function listDeliveries(sdb: ScopedDb, contractId?: string) {
  sdb.require(can.manageErp);
  const rows = await sdb.db
    .select({
      id: s.grainDeliveries.id,
      contractId: s.grainDeliveries.contractId,
      deliveredOn: s.grainDeliveries.deliveredOn,
      netKg: s.grainDeliveries.netKg,
      plotId: s.grainDeliveries.plotId,
      ticket: s.grainDeliveries.ticket,
      silo: s.grainDeliveries.silo,
      moisturePct: s.grainDeliveries.moisturePct,
    })
    .from(s.grainDeliveries)
    .where(
      and(
        eq(s.grainDeliveries.organizationId, sdb.auth.orgId),
        isNull(s.grainDeliveries.deletedAt),
        contractId ? eq(s.grainDeliveries.contractId, contractId) : isNotNull(s.grainDeliveries.contractId),
      ),
    )
    .orderBy(desc(s.grainDeliveries.deliveredOn))
    .limit(LIMITS.erp.listLimit);
  return rows.map(asDelivery);
}

export async function createDelivery(
  sdb: ScopedDb,
  i: {
    contractId: string;
    date: string;
    tons: number;
    farmId?: string | null;
    plotId?: string | null;
    ticket?: string | null;
    destination?: string | null;
    moisturePct?: number | null;
  },
) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const c = await contract(sdb, i.contractId);
  // A-23 pide la estancia: del lote, de la entrega o, si la organización tiene una sola, esa.
  let farmId = i.farmId ?? null;
  if (i.plotId) {
    const [p] = await sdb.db
      .select({ farmId: s.plots.farmId })
      .from(s.plots)
      .where(and(eq(s.plots.id, i.plotId), eq(s.plots.organizationId, org), isNull(s.plots.deletedAt)))
      .limit(1);
    if (!p) throw new NotFoundError("El lote no existe");
    if (farmId && farmId !== p.farmId) throw new HTTPException(400, { message: "El lote no es de esa estancia" });
    farmId = p.farmId;
  }
  if (!farmId) {
    const farms = await sdb.db
      .select({ id: s.farms.id })
      .from(s.farms)
      .where(and(eq(s.farms.organizationId, org), isNull(s.farms.deletedAt)))
      .limit(2);
    if (farms.length !== 1) throw new HTTPException(400, { message: "Indicá el lote o la estancia de la entrega" });
    farmId = farms[0]!.id;
  }
  await sdb.requireFarm(farmId);
  const crop = ((CROPS as readonly string[]).includes(c.crop) ? c.crop : "otro") as (typeof CROPS)[number];
  const kg = Math.round(i.tons * 1000 * 10) / 10;
  const ts = sdb.now();
  const id = newId();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.grainDeliveries).values({
      id,
      organizationId: org,
      farmId,
      plotId: i.plotId ?? null,
      seasonId: c.seasonId,
      crop,
      ticket: i.ticket?.trim() || NO_TICKET,
      silo: i.destination?.trim() || NO_SILO,
      deliveredOn: i.date,
      grossKg: kg,
      moisturePct: i.moisturePct ?? null,
      baseMoisturePct: BASE_MOISTURE_PCT[crop],
      impuritiesPct: 0,
      otherKg: 0,
      netKg: kg,
      contractId: c.id,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
  return { id };
}

export async function deleteDelivery(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const where = and(
    eq(s.grainDeliveries.id, id),
    eq(s.grainDeliveries.organizationId, sdb.auth.orgId),
    isNull(s.grainDeliveries.deletedAt),
    isNotNull(s.grainDeliveries.contractId),
  );
  const [row] = await sdb.db.select({ id: s.grainDeliveries.id }).from(s.grainDeliveries).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.update(s.grainDeliveries).set({ deletedAt: ts, updatedAt: ts, version: currentVersion }).where(where),
  ]);
}

export async function listSettlements(sdb: ScopedDb, contractId?: string) {
  sdb.require(can.manageErp);
  return sdb.db
    .select()
    .from(s.grainSettlements)
    .where(and(eq(s.grainSettlements.organizationId, sdb.auth.orgId), isNull(s.grainSettlements.deletedAt), contractId ? eq(s.grainSettlements.contractId, contractId) : undefined))
    .orderBy(desc(s.grainSettlements.date))
    .limit(LIMITS.erp.listLimit);
}

export async function createSettlement(
  sdb: ScopedDb,
  i: { contractId: string; number?: string | null; date: string; tons: number; priceMinor?: number | null; deductionsMinor?: number | null; farmId?: string | null; plotId?: string | null; dueDate?: string | null },
) {
  sdb.require(can.manageErp);
  const c = await contract(sdb, i.contractId);
  const center = await resolveCenter(sdb, { farmId: i.farmId, plotId: i.plotId, seasonId: c.seasonId, partyId: c.partyId });
  const price = i.priceMinor ?? c.priceMinor;
  const net = settlementNet(i.tons, price, i.deductionsMinor ?? 0);
  if (net <= 0) throw new HTTPException(400, { message: "El neto de la liquidación es cero" });
  const netPyg = await pygOf(sdb, net, c.currency as Currency, i.date);
  const ts = sdb.now();
  const id = newId();
  await runBatch(sdb.db, [
    sdb.db.insert(s.grainSettlements).values({
      id,
      organizationId: sdb.auth.orgId,
      contractId: c.id,
      number: i.number?.trim() || null,
      date: i.date,
      tons: i.tons,
      priceMinor: price,
      deductionsMinor: i.deductionsMinor ?? 0,
      netAmount: net,
      netPyg,
      currency: c.currency,
      farmId: center.farmId,
      plotId: center.plotId,
      seasonId: c.seasonId,
      dueDate: i.dueDate ?? null,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    }),
    sdb.db.insert(s.costEntries).values({
      id: newId(),
      organizationId: sdb.auth.orgId,
      occurredAt: noonAsuncion(i.date),
      farmId: center.farmId,
      plotId: center.plotId,
      seasonId: c.seasonId,
      activity: "agricultura",
      category: "sale",
      description: `${c.crop}${c.number ? ` · contrato ${c.number}` : ""}`.slice(0, 200),
      amount: net,
      currency: c.currency,
      amountPyg: netPyg,
      tons: i.tons,
      partyId: c.partyId,
      origin: "settlement",
      originId: id,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    }),
  ]);
  return { id, netAmount: net, netPyg };
}

export async function deleteSettlement(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const where = and(eq(s.grainSettlements.id, id), eq(s.grainSettlements.organizationId, org), isNull(s.grainSettlements.deletedAt));
  const [row] = await sdb.db.select({ paid: s.grainSettlements.paidAmount }).from(s.grainSettlements).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  if (row.paid > 0) throw new HTTPException(409, { message: "La liquidación tiene cobros registrados" });
  const ts = sdb.now();
  const gone = { deletedAt: ts, updatedAt: ts };
  await runBatch(sdb.db, [
    sdb.db.update(s.grainSettlements).set(gone).where(where),
    sdb.db.update(s.costEntries).set(gone).where(and(eq(s.costEntries.organizationId, org), eq(s.costEntries.origin, "settlement"), eq(s.costEntries.originId, id))),
  ]);
}
