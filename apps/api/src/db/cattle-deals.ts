/**
 * Compras y ventas de hacienda (E-35, G-40): cabezas, kilos, precio y guía de traslado.
 * Una venta es un ingreso de ganadería (con las toneladas, kilos / 1000) y una cuenta a cobrar; una compra, un costo de
 * ganadería y una cuenta a pagar (E-36). Los kilos vendidos son la base del costo por kilo de carne (results.ts).
 * No se descuenta hacienda del potrero: el stock se recalcula desde los conteos (ADR 0004). Montos: solo dueño y administrador.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { cattleFigures, LIMITS, newId, noonAsuncion, type CattleDealKind, type Currency } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runBatch } from "./client";
import { pygOf } from "./costs";
import { requireOwned } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";
import { HTTPException } from "hono/http-exception";

interface Input {
  kind: CattleDealKind;
  date: string;
  partyId?: string | null;
  farmId?: string | null;
  seasonId?: string | null;
  category?: string | null;
  heads: number;
  totalKg: number;
  amount: number;
  currency: Currency;
  guideNumber?: string | null;
  dueDate?: string | null;
  note?: string | null;
}

export async function listDeals(sdb: ScopedDb, kind?: CattleDealKind) {
  sdb.require(can.manageErp);
  const rows = await sdb.db
    .select()
    .from(s.cattleDeals)
    .where(and(eq(s.cattleDeals.organizationId, sdb.auth.orgId), isNull(s.cattleDeals.deletedAt), kind ? eq(s.cattleDeals.kind, kind) : undefined))
    .orderBy(desc(s.cattleDeals.date), desc(s.cattleDeals.createdAt))
    .limit(LIMITS.erp.listLimit);
  return rows.map((r) => ({ ...r, ...cattleFigures(r.amount, r.totalKg, r.heads) }));
}

export async function createDeal(sdb: ScopedDb, i: Input) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  if (i.partyId) await requireOwned(sdb, s.parties, i.partyId, i.kind === "sell" ? "El comprador" : "El proveedor");
  if (i.farmId) await sdb.requireFarm(i.farmId);
  if (i.seasonId) await requireOwned(sdb, s.seasons, i.seasonId, "La campaña");
  const amountPyg = await pygOf(sdb, i.amount, i.currency, i.date);
  const ts = sdb.now();
  const id = newId();
  const label = i.kind === "sell" ? "Venta de hacienda" : "Compra de hacienda";
  await runBatch(sdb.db, [
    sdb.db.insert(s.cattleDeals).values({
      id,
      organizationId: org,
      kind: i.kind,
      date: i.date,
      partyId: i.partyId ?? null,
      farmId: i.farmId ?? null,
      seasonId: i.seasonId ?? null,
      category: i.category?.trim() || null,
      heads: i.heads,
      totalKg: i.totalKg,
      amount: i.amount,
      currency: i.currency,
      amountPyg,
      guideNumber: i.guideNumber?.trim() || null,
      dueDate: i.dueDate ?? null,
      note: i.note?.trim() || null,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    }),
    sdb.db.insert(s.costEntries).values({
      id: newId(),
      organizationId: org,
      occurredAt: noonAsuncion(i.date),
      farmId: i.farmId ?? null,
      seasonId: i.seasonId ?? null,
      activity: "ganaderia",
      category: i.kind === "sell" ? "sale" : "other",
      description: `${label}: ${i.heads} cab.${i.category ? ` ${i.category}` : ""}`.slice(0, 200),
      amount: i.amount,
      currency: i.currency,
      amountPyg,
      tons: i.kind === "sell" ? i.totalKg / 1000 : null,
      partyId: i.partyId ?? null,
      origin: "cattle",
      originId: id,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    }),
  ]);
  return { id };
}

export async function deleteDeal(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const where = and(eq(s.cattleDeals.id, id), eq(s.cattleDeals.organizationId, org), isNull(s.cattleDeals.deletedAt));
  const [row] = await sdb.db.select({ paid: s.cattleDeals.paidAmount }).from(s.cattleDeals).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  if (row.paid > 0) throw new HTTPException(409, { message: "La operación tiene pagos o cobros registrados" });
  const ts = sdb.now();
  const gone = { deletedAt: ts, updatedAt: ts };
  await runBatch(sdb.db, [
    sdb.db.update(s.cattleDeals).set(gone).where(where),
    sdb.db.update(s.costEntries).set(gone).where(and(eq(s.costEntries.organizationId, org), eq(s.costEntries.origin, "cattle"), eq(s.costEntries.originId, id))),
  ]);
}
