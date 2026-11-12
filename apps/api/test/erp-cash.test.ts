/** E-36: caja y bancos por moneda, cuentas a pagar y a cobrar con vencimientos. */
import { describe, expect, it } from "vitest";
import { dueStatus } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, stockSetup } from "./erp-helpers";

async function setup() {
  const s = await stockSetup();
  const party = await erpPost(s.owner.token, "parties", { name: "Proveedor", kind: "both" });
  const gs = await erpPost(s.owner.token, "cash-accounts", { name: "Caja Gs.", type: "cash", currency: "PYG", openingBalance: 10_000_000 });
  const usd = await erpPost(s.owner.token, "cash-accounts", { name: "Banco USD", type: "bank", currency: "USD" });
  const gs2 = await erpPost(s.owner.token, "cash-accounts", { name: "Banco Gs.", type: "bank", currency: "PYG" });
  return { ...s, partyId: party.body.id as string, gs: gs.body.id as string, usd: usd.body.id as string, gs2: gs2.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;
const balances = async (s: S) => Object.fromEntries((await erpGet<any>(s.owner.token, "cash/balances")).body.accounts.map((a: any) => [a.name, a.balance]));
const purchase = async (s: S, dueDate: string | null, invoice = true) => {
  const o = await erpPost(s.owner.token, "purchases", { partyId: s.partyId, orderDate: "2026-11-01", currency: "PYG", lines: [{ description: "Repuestos", category: "machinery", qty: 1, unitPrice: 4_000_000 }] });
  if (invoice) await erpPost(s.owner.token, `purchases/${o.body.id}/invoice`, { invoiceNumber: "F-1", invoiceDate: "2026-11-02", dueDate });
  return o.body.id as string;
};
const settle = (s: S, body: Record<string, unknown>) => erpPost(s.owner.token, "cash/settle", { date: "2026-11-10", ...body });

describe("caja, bancos, cuentas a pagar y a cobrar (E-36)", () => {
  it("dueStatus: vencido, por vencer, en fecha y sin fecha", () => {
    expect(dueStatus("2026-11-09", "2026-11-10")).toEqual({ status: "overdue", daysLeft: -1 });
    expect(dueStatus("2026-11-10", "2026-11-10")).toEqual({ status: "soon", daysLeft: 0 });
    expect(dueStatus("2026-11-17", "2026-11-10")).toEqual({ status: "soon", daysLeft: 7 });
    expect(dueStatus("2026-11-18", "2026-11-10")).toEqual({ status: "ok", daysLeft: 8 });
    expect(dueStatus(null, "2026-11-10")).toEqual({ status: "none", daysLeft: null });
  });

  it("saldos por cuenta y total por moneda con movimientos manuales y transferencias", async () => {
    const s = await setup();
    await erpPost(s.owner.token, "cash/moves", { accountId: s.gs, date: "2026-11-05", amount: -2_500_000, description: "Gastos varios" });
    await erpPost(s.owner.token, "cash/moves", { accountId: s.usd, date: "2026-11-05", amount: 50_000 });
    const t = await erpPost(s.owner.token, "cash/transfers", { fromAccountId: s.gs, toAccountId: s.gs2, date: "2026-11-06", amount: 3_000_000 });
    expect(t.status).toBe(201);
    expect(await balances(s)).toEqual({ "Caja Gs.": 4_500_000, "Banco USD": 50_000, "Banco Gs.": 3_000_000 });
    const r = (await erpGet<any>(s.owner.token, "cash/balances")).body;
    expect(r.totals).toEqual({ PYG: 7_500_000, USD: 50_000 });
    // entre monedas distintas no
    expect((await erpPost(s.owner.token, "cash/transfers", { fromAccountId: s.gs, toAccountId: s.usd, date: "2026-11-06", amount: 1 })).status).toBe(400);
    expect((await erpPost(s.owner.token, "cash/transfers", { fromAccountId: s.gs, toAccountId: s.gs, date: "2026-11-06", amount: 1 })).status).toBe(400);
    // borrar una pata de la transferencia borra las dos
    const moves = (await erpGet<any[]>(s.owner.token, `cash/moves?accountId=${s.gs2}`)).body;
    await call("DELETE", `/org/erp/cash/moves/${moves[0].id}`, { token: s.owner.token });
    expect(await balances(s)).toEqual({ "Caja Gs.": 7_500_000, "Banco USD": 50_000, "Banco Gs.": 0 });
  });

  it("cuentas a pagar: la compra con factura aparece por vencimiento, pagar parcial y total la saldan", async () => {
    const s = await setup();
    await purchase(s, "2020-01-01", false); // sin factura: todavía no se debe
    const id = await purchase(s, "2020-01-01"); // vencida hace tiempo
    const late = await purchase(s, "2999-01-01");
    let p = (await erpGet<any>(s.owner.token, "payables")).body;
    expect(p.rows.map((r: any) => [r.docId, r.status])).toEqual([[id, "overdue"], [late, "ok"]]);
    expect(p.totals).toEqual({ PYG: { pending: 8_000_000, overdue: 4_000_000 } });
    const r1 = await settle(s, { docKind: "purchase", docId: id, accountId: s.gs, amount: 1_500_000 });
    expect(r1.body.pending).toBe(2_500_000);
    expect((await balances(s))["Caja Gs."]).toBe(8_500_000);
    expect((await erpGet<any>(s.owner.token, `purchases/${id}`)).body.paidAmount).toBe(1_500_000);
    expect((await settle(s, { docKind: "purchase", docId: id, accountId: s.gs, amount: 2_500_001 })).status).toBe(409);
    await settle(s, { docKind: "purchase", docId: id, accountId: s.gs2, amount: 2_500_000 });
    p = (await erpGet<any>(s.owner.token, "payables")).body;
    expect(p.rows.map((r: any) => r.docId)).toEqual([late]);
    // borrar un pago devuelve la deuda y el saldo
    const mv = (await erpGet<any[]>(s.owner.token, `cash/moves?accountId=${s.gs}`)).body.find((m) => m.docId === id);
    await call("DELETE", `/org/erp/cash/moves/${mv.id}`, { token: s.owner.token });
    expect((await balances(s))["Caja Gs."]).toBe(10_000_000);
    expect((await erpGet<any>(s.owner.token, "payables")).body.rows.find((r: any) => r.docId === id).pending).toBe(1_500_000);
  });

  it("cuentas a cobrar: liquidaciones de granos y ventas de hacienda; cobrar suma a la caja; la moneda tiene que coincidir", async () => {
    const s = await setup();
    const contract = await erpPost(s.owner.token, "grain-contracts", { crop: "soja", tons: 10, priceMinor: 2_500_000, currency: "PYG" });
    const l = await erpPost(s.owner.token, "grain-settlements", { contractId: contract.body.id, date: "2026-11-05", tons: 10, dueDate: "2026-12-05" });
    const cattle = await erpPost(s.owner.token, "cattle-deals", { kind: "sell", date: "2026-11-05", heads: 5, totalKg: 2000, amount: 16_000_000, currency: "PYG", dueDate: "2026-11-20" });
    await erpPost(s.owner.token, "cattle-deals", { kind: "buy", date: "2026-11-05", heads: 5, totalKg: 2000, amount: 1_000_000, currency: "PYG" });
    const r = (await erpGet<any>(s.owner.token, "receivables")).body;
    expect(r.rows.map((x: any) => [x.docKind, x.pending])).toEqual([["cattle", 16_000_000], ["settlement", 25_000_000]]);
    expect((await erpGet<any>(s.owner.token, "payables")).body.rows.map((x: any) => x.docKind)).toEqual(["cattle"]);
    expect((await settle(s, { docKind: "settlement", docId: l.body.id, accountId: s.usd, amount: 1 })).status).toBe(400);
    await settle(s, { docKind: "settlement", docId: l.body.id, accountId: s.gs2, amount: 25_000_000 });
    await settle(s, { docKind: "cattle", docId: cattle.body.id, accountId: s.gs, amount: 6_000_000 });
    expect(await balances(s)).toMatchObject({ "Banco Gs.": 25_000_000, "Caja Gs.": 16_000_000 });
    expect((await erpGet<any>(s.owner.token, "receivables")).body.rows).toHaveLength(1);
    // no se borra lo que ya tiene cobros
    expect((await call("DELETE", `/org/erp/grain-settlements/${l.body.id}`, { token: s.owner.token })).status).toBe(409);
    expect((await call("DELETE", `/org/erp/cattle-deals/${cattle.body.id}`, { token: s.owner.token })).status).toBe(409);
  });

  it("no se borra una cuenta con movimientos; valida cuentas, documentos y montos de la organización", async () => {
    const s = await setup();
    const other = await setup();
    expect((await call("DELETE", `/org/erp/cash-accounts/${s.usd}`, { token: s.owner.token })).status).toBe(200);
    await erpPost(s.owner.token, "cash/moves", { accountId: s.gs, date: "2026-11-05", amount: 1 });
    expect((await call("DELETE", `/org/erp/cash-accounts/${s.gs}`, { token: s.owner.token })).status).toBe(409);
    expect((await erpPost(s.owner.token, "cash/moves", { accountId: other.gs, date: "2026-11-05", amount: 1 })).status).toBe(404);
    expect((await erpPost(s.owner.token, "cash/moves", { accountId: s.gs, date: "2026-11-05", amount: 0 })).status).toBe(400);
    expect((await erpPost(s.owner.token, "cash-accounts", { name: "X", type: "caja", currency: "PYG" })).status).toBe(400);
    const id = await purchase(s, null);
    expect((await settle(s, { docKind: "purchase", docId: id, accountId: other.gs, amount: 1 })).status).toBe(404);
    expect((await settle(other, { docKind: "purchase", docId: id, accountId: other.gs, amount: 1 })).status).toBe(404);
    expect((await settle(s, { docKind: "purchase", docId: id, accountId: s.gs, amount: 0 })).status).toBe(400);
    const noInvoice = await purchase(s, null, false);
    expect((await settle(s, { docKind: "purchase", docId: noInvoice, accountId: s.gs, amount: 1 })).status).toBe(409);
  });

  it("permisos: son montos, solo dueño y administrador (el agrónomo y el empleado, no)", async () => {
    const s = await setup();
    expect((await erpPost(s.admin.token, "cash/moves", { accountId: s.gs, date: "2026-11-05", amount: 5 })).status).toBe(201);
    for (const who of [s.agro, s.worker]) {
      for (const p of ["cash-accounts", "cash/balances", "cash/moves", "payables", "receivables"]) expect((await erpGet(who.token, p)).status).toBe(403);
      expect((await erpPost(who.token, "cash/moves", { accountId: s.gs, date: "2026-11-05", amount: 5 })).status).toBe(403);
      expect((await erpPost(who.token, "cash/settle", { docKind: "purchase", docId: crypto.randomUUID(), accountId: s.gs, date: "2026-11-05", amount: 5 })).status).toBe(403);
      expect((await erpPost(who.token, "cash/transfers", { fromAccountId: s.gs, toAccountId: s.gs2, date: "2026-11-05", amount: 5 })).status).toBe(403);
      expect((await erpPost(who.token, "cash-accounts", { name: "X", type: "cash", currency: "PYG" })).status).toBe(403);
    }
  });
});
