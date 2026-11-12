/**
 * Exportación para sistemas contables (I-06): filas de compras, ventas y caja con el tercero (RUC) y los datos de IVA
 * (timbrado y gravadas 10 %, 5 % y exentas, que se cargan acá por documento). El texto final se arma en el navegador.
 * Solo dueño y administrador (son montos).
 */
import { and, asc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { LIMITS, newId, type ExportCashMove, type ExportDataset, type ExportDoc, type TaxDocKind } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, NotFoundError, type ScopedDb } from "./scoped";

const docTable = { purchase: s.purchases, settlement: s.grainSettlements, cattle: s.cattleDeals } as const;

/** Guarda (reemplaza) el timbrado y el desglose de IVA de un documento de la organización. */
export async function saveDocumentTax(sdb: ScopedDb, i: { docKind: TaxDocKind; docId: string; timbrado?: string | null; gross10: number; gross5: number; exempt: number }) {
  sdb.require(can.manageErp);
  const t = docTable[i.docKind];
  const [doc] = await sdb.db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.id, i.docId), eq(t.organizationId, sdb.auth.orgId), isNull(t.deletedAt)))
    .limit(1);
  if (!doc) throw new NotFoundError("El documento no existe");
  const set = { timbrado: i.timbrado?.trim() || null, gross10: i.gross10, gross5: i.gross5, exempt: i.exempt, updatedBy: sdb.auth.userId, updatedAt: sdb.now() };
  await sdb.db
    .insert(s.documentTaxes)
    .values({ id: newId(), organizationId: sdb.auth.orgId, docKind: i.docKind, docId: i.docId, ...set })
    .onConflictDoUpdate({ target: [s.documentTaxes.organizationId, s.documentTaxes.docKind, s.documentTaxes.docId], set });
  return { ok: true };
}

export async function deleteDocumentTax(sdb: ScopedDb, docKind: TaxDocKind, docId: string) {
  sdb.require(can.manageErp);
  await sdb.db
    .delete(s.documentTaxes)
    .where(and(eq(s.documentTaxes.organizationId, sdb.auth.orgId), eq(s.documentTaxes.docKind, docKind), eq(s.documentTaxes.docId, docId)));
}

/**
 * Filas del conjunto de datos entre dos fechas (inclusive), de la más vieja a la más nueva, hasta exportLimit.
 * - purchases: facturas de compra (con número) y compras de hacienda, por fecha de factura.
 * - sales: liquidaciones de granos y ventas de hacienda.
 * - cash: movimientos de caja y bancos.
 * Cinco consultas como mucho.
 */
export async function exportRows(sdb: ScopedDb, dataset: ExportDataset, from: string, to: string) {
  sdb.require(can.manageErp);
  if (from > to) throw new HTTPException(400, { message: "La fecha inicial es posterior a la final" });
  const org = sdb.auth.orgId;
  const limit = LIMITS.erp.exportLimit + 1;
  const parties = await sdb.db.select({ id: s.parties.id, name: s.parties.name, ruc: s.parties.ruc }).from(s.parties).where(eq(s.parties.organizationId, org));
  const party = new Map(parties.map((p) => [p.id, p]));
  const who = (id: string | null) => ({ party: (id && party.get(id)?.name) || "", ruc: (id && party.get(id)?.ruc) || "" });

  if (dataset === "cash") {
    const m = s.cashMoves;
    const [moves, accounts] = await Promise.all([
      sdb.db
        .select()
        .from(m)
        .where(and(eq(m.organizationId, org), isNull(m.deletedAt), gte(m.date, from), lte(m.date, to)))
        .orderBy(asc(m.date), asc(m.createdAt))
        .limit(limit),
      sdb.db.select({ id: s.cashAccounts.id, name: s.cashAccounts.name, currency: s.cashAccounts.currency }).from(s.cashAccounts).where(eq(s.cashAccounts.organizationId, org)),
    ]);
    const acc = new Map(accounts.map((a) => [a.id, a]));
    const rows: ExportCashMove[] = moves.slice(0, LIMITS.erp.exportLimit).map((x) => ({
      date: x.date,
      account: acc.get(x.accountId)?.name ?? "",
      currency: acc.get(x.accountId)?.currency ?? "PYG",
      description: x.description ?? "",
      ...who(x.partyId),
      docKind: x.docKind ?? "",
      amountMinor: x.amount,
    }));
    return { truncated: moves.length > LIMITS.erp.exportLimit, rows };
  }

  const docs: ExportDoc[] = [];
  if (dataset === "purchases") {
    const p = s.purchases;
    const c = s.cattleDeals;
    const [purch, buys] = await Promise.all([
      sdb.db
        .select()
        .from(p)
        .where(and(eq(p.organizationId, org), isNull(p.deletedAt), isNotNull(p.invoiceNumber), gte(p.invoiceDate, from), lte(p.invoiceDate, to)))
        .limit(limit),
      sdb.db
        .select()
        .from(c)
        .where(and(eq(c.organizationId, org), isNull(c.deletedAt), eq(c.kind, "buy"), gte(c.date, from), lte(c.date, to)))
        .limit(limit),
    ]);
    for (const x of purch)
      docs.push({ docKind: "purchase", docId: x.id, date: x.invoiceDate ?? x.orderDate, number: x.invoiceNumber, concept: "Compra", ...who(x.partyId), currency: x.currency, amountMinor: x.totalAmount, amountPyg: x.totalPyg, dueDate: x.dueDate, timbrado: null, gross10: null, gross5: null, exempt: null });
    for (const x of buys)
      docs.push({ docKind: "cattle", docId: x.id, date: x.date, number: x.guideNumber, concept: "Compra de hacienda", ...who(x.partyId), currency: x.currency, amountMinor: x.amount, amountPyg: x.amountPyg, dueDate: x.dueDate, timbrado: null, gross10: null, gross5: null, exempt: null });
  } else {
    const l = s.grainSettlements;
    const c = s.cattleDeals;
    const [sett, sells, contracts] = await Promise.all([
      sdb.db
        .select()
        .from(l)
        .where(and(eq(l.organizationId, org), isNull(l.deletedAt), gte(l.date, from), lte(l.date, to)))
        .limit(limit),
      sdb.db
        .select()
        .from(c)
        .where(and(eq(c.organizationId, org), isNull(c.deletedAt), eq(c.kind, "sell"), gte(c.date, from), lte(c.date, to)))
        .limit(limit),
      sdb.db.select({ id: s.grainContracts.id, partyId: s.grainContracts.partyId, crop: s.grainContracts.crop }).from(s.grainContracts).where(eq(s.grainContracts.organizationId, org)),
    ]);
    const contract = new Map(contracts.map((x) => [x.id, x]));
    for (const x of sett) {
      const k = contract.get(x.contractId);
      docs.push({ docKind: "settlement", docId: x.id, date: x.date, number: x.number, concept: `Venta de ${k?.crop ?? "granos"}`, ...who(k?.partyId ?? null), currency: x.currency, amountMinor: x.netAmount, amountPyg: x.netPyg, dueDate: x.dueDate, timbrado: null, gross10: null, gross5: null, exempt: null });
    }
    for (const x of sells)
      docs.push({ docKind: "cattle", docId: x.id, date: x.date, number: x.guideNumber, concept: "Venta de hacienda", ...who(x.partyId), currency: x.currency, amountMinor: x.amount, amountPyg: x.amountPyg, dueDate: x.dueDate, timbrado: null, gross10: null, gross5: null, exempt: null });
  }
  docs.sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? "").localeCompare(b.number ?? ""));
  const kept = docs.slice(0, LIMITS.erp.exportLimit);
  // Timbrado y desglose de IVA: una sola consulta con los de la organización (una fila por documento cargado).
  const taxes = await sdb.db
    .select()
    .from(s.documentTaxes)
    .where(eq(s.documentTaxes.organizationId, org))
    .limit(LIMITS.erp.exportLimit * 3);
  const tax = new Map(taxes.map((r) => [`${r.docKind}:${r.docId}`, r]));
  for (const d of kept) {
    const r = tax.get(`${d.docKind}:${d.docId}`);
    if (r) Object.assign(d, { timbrado: r.timbrado, gross10: r.gross10, gross5: r.gross5, exempt: r.exempt });
  }
  return { truncated: docs.length > LIMITS.erp.exportLimit, rows: kept };
}
