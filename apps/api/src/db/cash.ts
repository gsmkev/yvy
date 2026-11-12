/**
 * Caja y bancos por moneda, cuentas a pagar y a cobrar con vencimiento (E-36).
 * Pagar o cobrar un documento (compra con factura, liquidación de granos, compra o venta de hacienda) mueve plata en una
 * cuenta de su misma moneda y suma a lo pagado del documento, todo en un db.batch(). Solo dueño y administrador.
 */
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { dueStatus, LIMITS, localDate, newId, type Currency, type DocKind } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runBatch, type Stmt } from "./client";
import { requireOwned } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export async function accountBalances(sdb: ScopedDb) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const [accounts, sums] = await Promise.all([
    sdb.db
      .select()
      .from(s.cashAccounts)
      .where(and(eq(s.cashAccounts.organizationId, org), isNull(s.cashAccounts.deletedAt)))
      .orderBy(s.cashAccounts.name),
    sdb.db
      .select({ accountId: s.cashMoves.accountId, total: sql<number>`SUM(${s.cashMoves.amount})` })
      .from(s.cashMoves)
      .where(and(eq(s.cashMoves.organizationId, org), isNull(s.cashMoves.deletedAt)))
      .groupBy(s.cashMoves.accountId),
  ]);
  const accounts2 = accounts.map((a) => ({ ...a, balance: a.openingBalance + (sums.find((x) => x.accountId === a.id)?.total ?? 0) }));
  const byCurrency: Record<string, number> = {};
  for (const a of accounts2) byCurrency[a.currency] = (byCurrency[a.currency] ?? 0) + a.balance;
  return { accounts: accounts2, totals: byCurrency };
}

export async function listMoves(sdb: ScopedDb, accountId?: string) {
  sdb.require(can.manageErp);
  return sdb.db
    .select()
    .from(s.cashMoves)
    .where(and(eq(s.cashMoves.organizationId, sdb.auth.orgId), isNull(s.cashMoves.deletedAt), accountId ? eq(s.cashMoves.accountId, accountId) : undefined))
    .orderBy(desc(s.cashMoves.date), desc(s.cashMoves.createdAt))
    .limit(LIMITS.erp.listLimit);
}

async function account(sdb: ScopedDb, id: string) {
  const [a] = await sdb.db
    .select()
    .from(s.cashAccounts)
    .where(and(eq(s.cashAccounts.id, id), eq(s.cashAccounts.organizationId, sdb.auth.orgId), isNull(s.cashAccounts.deletedAt)))
    .limit(1);
  if (!a) throw new NotFoundError("La cuenta no existe");
  return a;
}

export async function requireAccountUnused(sdb: ScopedDb, id: string) {
  const [m] = await sdb.db
    .select({ id: s.cashMoves.id })
    .from(s.cashMoves)
    .where(and(eq(s.cashMoves.organizationId, sdb.auth.orgId), eq(s.cashMoves.accountId, id), isNull(s.cashMoves.deletedAt)))
    .limit(1);
  if (m) throw new HTTPException(409, { message: "La cuenta tiene movimientos: no se puede borrar" });
}

export async function createMove(sdb: ScopedDb, i: { accountId: string; date: string; amount: number; description?: string | null; partyId?: string | null }) {
  sdb.require(can.manageErp);
  await account(sdb, i.accountId);
  if (i.partyId) await requireOwned(sdb, s.parties, i.partyId, "El tercero");
  const ts = sdb.now();
  const id = newId();
  await sdb.db.insert(s.cashMoves).values({
    id,
    organizationId: sdb.auth.orgId,
    accountId: i.accountId,
    date: i.date,
    amount: i.amount,
    description: i.description?.trim() || null,
    partyId: i.partyId ?? null,
    createdBy: sdb.auth.userId,
    createdAt: ts,
    updatedAt: ts,
  });
  return { id };
}

/** Transferencia entre dos cuentas de la misma moneda: una salida y una entrada con el mismo `docId`. */
export async function transfer(sdb: ScopedDb, i: { fromAccountId: string; toAccountId: string; date: string; amount: number; description?: string | null }) {
  sdb.require(can.manageErp);
  if (i.fromAccountId === i.toAccountId) throw new HTTPException(400, { message: "Elegí dos cuentas distintas" });
  const [from, to] = await Promise.all([account(sdb, i.fromAccountId), account(sdb, i.toAccountId)]);
  if (from.currency !== to.currency) throw new HTTPException(400, { message: "Las cuentas tienen que ser de la misma moneda" });
  const ts = sdb.now();
  const id = newId();
  const base = { organizationId: sdb.auth.orgId, date: i.date, description: i.description?.trim() || null, docKind: "transfer", docId: id, createdBy: sdb.auth.userId, createdAt: ts, updatedAt: ts };
  await runBatch(sdb.db, [
    sdb.db.insert(s.cashMoves).values({ ...base, id: newId(), accountId: from.id, amount: -i.amount }),
    sdb.db.insert(s.cashMoves).values({ ...base, id: newId(), accountId: to.id, amount: i.amount }),
  ]);
  return { id };
}

interface Doc {
  currency: Currency;
  total: number;
  paid: number;
  payable: boolean;
  partyId: string | null;
}

async function loadDoc(sdb: ScopedDb, kind: DocKind, id: string): Promise<Doc> {
  const org = sdb.auth.orgId;
  if (kind === "purchase") {
    const [d] = await sdb.db
      .select()
      .from(s.purchases)
      .where(and(eq(s.purchases.id, id), eq(s.purchases.organizationId, org), isNull(s.purchases.deletedAt)))
      .limit(1);
    if (!d) throw new NotFoundError("El documento no existe");
    if (!d.invoiceNumber) throw new HTTPException(409, { message: "La compra todavía no tiene factura" });
    return { currency: d.currency, total: d.totalAmount, paid: d.paidAmount, payable: true, partyId: d.partyId };
  }
  if (kind === "settlement") {
    const [d] = await sdb.db
      .select()
      .from(s.grainSettlements)
      .where(and(eq(s.grainSettlements.id, id), eq(s.grainSettlements.organizationId, org), isNull(s.grainSettlements.deletedAt)))
      .limit(1);
    if (!d) throw new NotFoundError("El documento no existe");
    return { currency: d.currency, total: d.netAmount, paid: d.paidAmount, payable: false, partyId: null };
  }
  const [d] = await sdb.db
    .select()
    .from(s.cattleDeals)
    .where(and(eq(s.cattleDeals.id, id), eq(s.cattleDeals.organizationId, org), isNull(s.cattleDeals.deletedAt)))
    .limit(1);
  if (!d) throw new NotFoundError("El documento no existe");
  return { currency: d.currency, total: d.amount, paid: d.paidAmount, payable: d.kind === "buy", partyId: d.partyId };
}

const paidUpdate = (sdb: ScopedDb, kind: DocKind, id: string, delta: number): Stmt => {
  const ts = sdb.now();
  if (kind === "purchase") return sdb.db.update(s.purchases).set({ paidAmount: sql`${s.purchases.paidAmount} + ${delta}`, updatedAt: ts }).where(eq(s.purchases.id, id));
  if (kind === "settlement") return sdb.db.update(s.grainSettlements).set({ paidAmount: sql`${s.grainSettlements.paidAmount} + ${delta}`, updatedAt: ts }).where(eq(s.grainSettlements.id, id));
  return sdb.db.update(s.cattleDeals).set({ paidAmount: sql`${s.cattleDeals.paidAmount} + ${delta}`, updatedAt: ts }).where(eq(s.cattleDeals.id, id));
};

/** Paga (cuentas a pagar) o cobra (cuentas a cobrar) todo o parte de un documento, desde una cuenta de su moneda. */
export async function settle(sdb: ScopedDb, i: { docKind: DocKind; docId: string; accountId: string; date: string; amount: number; description?: string | null }) {
  sdb.require(can.manageErp);
  const [doc, acc] = await Promise.all([loadDoc(sdb, i.docKind, i.docId), account(sdb, i.accountId)]);
  if (acc.currency !== doc.currency) throw new HTTPException(400, { message: `El documento es en ${doc.currency}: usá una cuenta en esa moneda` });
  const pending = doc.total - doc.paid;
  if (i.amount > pending) throw new HTTPException(409, { message: "El monto es mayor que lo que falta" });
  const ts = sdb.now();
  const id = newId();
  await runBatch(sdb.db, [
    sdb.db.insert(s.cashMoves).values({
      id,
      organizationId: sdb.auth.orgId,
      accountId: acc.id,
      date: i.date,
      amount: doc.payable ? -i.amount : i.amount,
      description: i.description?.trim() || null,
      partyId: doc.partyId,
      docKind: i.docKind,
      docId: i.docId,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    }),
    paidUpdate(sdb, i.docKind, i.docId, i.amount),
  ]);
  return { id, pending: pending - i.amount };
}

/** Borra un movimiento: si pagaba o cobraba un documento, el documento vuelve a deber lo que se había saldado. */
export async function deleteMove(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const [m] = await sdb.db
    .select()
    .from(s.cashMoves)
    .where(and(eq(s.cashMoves.id, id), eq(s.cashMoves.organizationId, org), isNull(s.cashMoves.deletedAt)))
    .limit(1);
  if (!m) throw new NotFoundError("No existe");
  const ts = sdb.now();
  const gone = { deletedAt: ts, updatedAt: ts };
  const stmts: Stmt[] = [];
  if (m.docKind === "transfer" && m.docId)
    stmts.push(sdb.db.update(s.cashMoves).set(gone).where(and(eq(s.cashMoves.organizationId, org), eq(s.cashMoves.docKind, "transfer"), eq(s.cashMoves.docId, m.docId))));
  else stmts.push(sdb.db.update(s.cashMoves).set(gone).where(eq(s.cashMoves.id, id)));
  if (m.docId && (m.docKind === "purchase" || m.docKind === "settlement" || m.docKind === "cattle")) stmts.push(paidUpdate(sdb, m.docKind, m.docId, -Math.abs(m.amount)));
  await runBatch(sdb.db, stmts);
}

export interface DueRow {
  docKind: DocKind;
  docId: string;
  partyId: string | null;
  label: string;
  currency: Currency;
  total: number;
  paid: number;
  pending: number;
  dueDate: string | null;
  status: "none" | "overdue" | "soon" | "ok";
  daysLeft: number | null;
}

/** Cuentas a pagar o a cobrar: documentos con saldo pendiente, por vencimiento. Tres consultas. */
export async function dues(sdb: ScopedDb, direction: "payable" | "receivable") {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const today = localDate(sdb.now());
  const rows: Omit<DueRow, "status" | "daysLeft">[] = [];
  if (direction === "payable") {
    const [purch, buys] = await Promise.all([
      sdb.db
        .select()
        .from(s.purchases)
        .where(and(eq(s.purchases.organizationId, org), isNull(s.purchases.deletedAt), isNotNull(s.purchases.invoiceNumber), gt(sql`${s.purchases.totalAmount} - ${s.purchases.paidAmount}`, 0))),
      sdb.db
        .select()
        .from(s.cattleDeals)
        .where(and(eq(s.cattleDeals.organizationId, org), isNull(s.cattleDeals.deletedAt), eq(s.cattleDeals.kind, "buy"), gt(sql`${s.cattleDeals.amount} - ${s.cattleDeals.paidAmount}`, 0))),
    ]);
    for (const p of purch)
      rows.push({ docKind: "purchase", docId: p.id, partyId: p.partyId, label: `Factura ${p.invoiceNumber}`, currency: p.currency, total: p.totalAmount, paid: p.paidAmount, pending: p.totalAmount - p.paidAmount, dueDate: p.dueDate });
    for (const d of buys)
      rows.push({ docKind: "cattle", docId: d.id, partyId: d.partyId, label: `Compra de hacienda${d.guideNumber ? ` · guía ${d.guideNumber}` : ""}`, currency: d.currency, total: d.amount, paid: d.paidAmount, pending: d.amount - d.paidAmount, dueDate: d.dueDate });
  } else {
    const [sett, sells, parties] = await Promise.all([
      sdb.db
        .select()
        .from(s.grainSettlements)
        .where(and(eq(s.grainSettlements.organizationId, org), isNull(s.grainSettlements.deletedAt), gt(sql`${s.grainSettlements.netAmount} - ${s.grainSettlements.paidAmount}`, 0))),
      sdb.db
        .select()
        .from(s.cattleDeals)
        .where(and(eq(s.cattleDeals.organizationId, org), isNull(s.cattleDeals.deletedAt), eq(s.cattleDeals.kind, "sell"), gt(sql`${s.cattleDeals.amount} - ${s.cattleDeals.paidAmount}`, 0))),
      sdb.db
        .select({ id: s.grainContracts.id, partyId: s.grainContracts.partyId, crop: s.grainContracts.crop })
        .from(s.grainContracts)
        .where(and(eq(s.grainContracts.organizationId, org))),
    ]);
    for (const l of sett) {
      const c = parties.find((x) => x.id === l.contractId);
      rows.push({ docKind: "settlement", docId: l.id, partyId: c?.partyId ?? null, label: `Liquidación${l.number ? ` ${l.number}` : ""}${c ? ` · ${c.crop}` : ""}`, currency: l.currency, total: l.netAmount, paid: l.paidAmount, pending: l.netAmount - l.paidAmount, dueDate: l.dueDate });
    }
    for (const d of sells)
      rows.push({ docKind: "cattle", docId: d.id, partyId: d.partyId, label: `Venta de hacienda${d.guideNumber ? ` · guía ${d.guideNumber}` : ""}`, currency: d.currency, total: d.amount, paid: d.paidAmount, pending: d.amount - d.paidAmount, dueDate: d.dueDate });
  }
  const out: DueRow[] = rows.map((r) => ({ ...r, ...dueStatus(r.dueDate, today) }));
  out.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const totals: Record<string, { pending: number; overdue: number }> = {};
  for (const r of out) {
    const t = (totals[r.currency] ??= { pending: 0, overdue: 0 });
    t.pending += r.pending;
    if (r.status === "overdue") t.overdue += r.pending;
  }
  return { rows: out.slice(0, LIMITS.erp.listLimit), totals };
}
