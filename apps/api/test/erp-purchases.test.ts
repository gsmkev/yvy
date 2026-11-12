/** E-33: compras (orden, factura del proveedor, recepción en depósito con movimientos de stock y costo). */
import { describe, expect, it } from "vitest";
import { lineAmount, purchaseStatus } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, stockSetup } from "./erp-helpers";

async function setup() {
  const s = await stockSetup();
  const party = await erpPost(s.owner.token, "parties", { name: "Agro Insumos SA", ruc: "80012345-6", kind: "supplier" });
  return { ...s, partyId: party.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;
const order = (s: S, extra: Record<string, unknown> = {}, lines?: unknown[]) =>
  erpPost(s.owner.token, "purchases", {
    partyId: s.partyId,
    farmId: s.farmId,
    orderDate: "2026-11-01",
    currency: "PYG",
    lines: lines ?? [
      { productId: s.productId, qty: 100, unitPrice: 40_000, lot: "L1", expiresOn: "2027-12-31" },
      { description: "Flete", category: "other", activity: "agricultura", qty: 1, unitPrice: 500_000 },
    ],
    ...extra,
  });
const get = async (s: S, id: string, token = s.owner.token) => (await erpGet<any>(token, `purchases/${id}`)).body;
const receive = (s: S, id: string, body: Record<string, unknown> = {}) =>
  erpPost(s.owner.token, `purchases/${id}/receive`, { warehouseId: s.whA, date: "2026-11-05", ...body });
const stock = async (s: S) => (await erpGet<any>(s.owner.token, "stock")).body.products.find((p: any) => p.productId === s.productId);

describe("compras (E-33)", () => {
  it("funciones puras: importe de línea y estado derivado", () => {
    expect(lineAmount(2.5, 1001)).toBe(2503);
    expect(purchaseStatus({ invoiceNumber: null, receivedAt: null })).toBe("ordered");
    expect(purchaseStatus({ invoiceNumber: "001", receivedAt: null })).toBe("invoiced");
    expect(purchaseStatus({ invoiceNumber: null, receivedAt: "2026-11-05" })).toBe("received");
    expect(purchaseStatus({ invoiceNumber: "001", receivedAt: "2026-11-05" })).toBe("complete");
  });

  it("orden → factura → recepción: stock con lote y vencimiento, costo del gasto sin producto", async () => {
    const s = await setup();
    const o = await order(s);
    expect(o.status).toBe(201);
    let p = await get(s, o.body.id);
    expect(p).toMatchObject({ status: "ordered", totalAmount: 4_500_000, totalPyg: 4_500_000, lines: expect.any(Array) });
    expect(p.lines).toHaveLength(2);
    expect(await stock(s)).toBeUndefined();

    expect((await erpPost(s.owner.token, `purchases/${o.body.id}/invoice`, { invoiceNumber: "001-001-0000123", invoiceDate: "2026-11-02", dueDate: "2026-12-02" })).status).toBe(200);
    expect((await get(s, o.body.id)).status).toBe("invoiced");

    const r = await receive(s, o.body.id);
    expect(r.body).toEqual({ moves: 1, costs: 1 });
    p = await get(s, o.body.id);
    expect(p).toMatchObject({ status: "complete", receivedAt: "2026-11-05", warehouseId: s.whA, dueDate: "2026-12-02" });
    expect(await stock(s)).toMatchObject({ qty: 100, valuePyg: 4_000_000, avgCostPyg: 40_000 });
    const moves = (await erpGet<any[]>(s.owner.token, "stock/moves")).body;
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ origin: "purchase", originId: o.body.id, lot: "L1", expiresOn: "2027-12-31", partyId: s.partyId, amount: 4_000_000, currency: "PYG", note: "Factura 001-001-0000123" });
    const costs = (await erpGet<any>(s.owner.token, "costs")).body.rows;
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ category: "other", activity: "agricultura", amountPyg: 500_000, description: "Flete", origin: "purchase", originId: o.body.id, farmId: s.farmId, partyId: s.partyId });
    // el stock con vencimiento entra al aviso de lotes
    expect((await erpGet<any[]>(s.owner.token, "stock/expiring?days=1000")).status).toBe(200);
    expect((await receive(s, o.body.id)).status).toBe(409);
  });

  it("la recepción puede ir antes que la factura, con cantidades recibidas distintas, lote y vencimiento propios", async () => {
    const s = await setup();
    const o = await order(s);
    const lines = (await get(s, o.body.id)).lines;
    const prodLine = lines.find((l: any) => l.productId);
    const r = await receive(s, o.body.id, { lines: [{ lineId: prodLine.id, qty: 80, lot: "L9", expiresOn: "2028-01-31" }] });
    expect(r.status).toBe(200);
    let p = await get(s, o.body.id);
    expect(p).toMatchObject({ status: "received", totalAmount: 3_200_000 + 500_000 });
    expect(await stock(s)).toMatchObject({ qty: 80, valuePyg: 3_200_000 });
    expect((await erpGet<any[]>(s.owner.token, "stock/moves")).body[0]).toMatchObject({ lot: "L9", expiresOn: "2028-01-31" });
    await erpPost(s.owner.token, `purchases/${o.body.id}/invoice`, { invoiceNumber: "A-1", invoiceDate: "2026-11-06" });
    p = await get(s, o.body.id);
    expect(p.status).toBe("complete");
    expect(p.totalAmount).toBe(3_700_000);
  });

  it("deshacer la recepción borra el stock y el costo; después se puede recibir de nuevo y borrar la compra", async () => {
    const s = await setup();
    const o = await order(s);
    expect((await erpPost(s.owner.token, `purchases/${o.body.id}/invoice`, { invoiceNumber: "X", invoiceDate: "2026-11-02" })).status).toBe(200);
    await receive(s, o.body.id);
    expect((await call("DELETE", `/org/erp/purchases/${o.body.id}`, { token: s.owner.token })).status).toBe(409);
    expect((await call("DELETE", `/org/erp/purchases/${o.body.id}/reception`, { token: s.owner.token })).status).toBe(200);
    expect(await stock(s)).toBeUndefined();
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toEqual([]);
    expect((await get(s, o.body.id)).status).toBe("invoiced");
    expect((await call("DELETE", `/org/erp/purchases/${o.body.id}/reception`, { token: s.owner.token })).status).toBe(409);
    await receive(s, o.body.id);
    expect(await stock(s)).toMatchObject({ qty: 100 });
    await call("DELETE", `/org/erp/purchases/${o.body.id}/reception`, { token: s.owner.token });
    expect((await call("DELETE", `/org/erp/purchases/${o.body.id}`, { token: s.owner.token })).status).toBe(200);
    expect((await erpGet<any[]>(s.owner.token, "purchases")).body).toEqual([]);
  });

  it("en dólares convierte con el tipo de cambio (pide cargarlo) y el listado filtra por estado", async () => {
    const s = await setup();
    expect((await order(s, { currency: "USD" }, [{ productId: s.productId, qty: 10, unitPrice: 2500 }])).status).toBe(400);
    await call("PUT", "/org/erp/exchange-rates/2026-11-01", { token: s.owner.token, body: { usdToPyg: 7000 } });
    const o = await order(s, { currency: "USD" }, [{ productId: s.productId, qty: 10, unitPrice: 2500 }]);
    expect(o.status).toBe(201);
    expect(await get(s, o.body.id)).toMatchObject({ totalAmount: 25_000, totalPyg: 1_750_000 });
    await receive(s, o.body.id);
    expect(await stock(s)).toMatchObject({ qty: 10, valuePyg: 1_750_000 });
    const other = await order(s);
    expect((await erpGet<any[]>(s.owner.token, "purchases?status=ordered")).body.map((x) => x.id)).toEqual([other.body.id]);
    expect((await erpGet<any[]>(s.owner.token, "purchases?status=received")).body).toHaveLength(1);
  });

  it("valida: proveedor, estancia, producto y depósito de la organización; líneas y montos", async () => {
    const s = await setup();
    const other = await setup();
    expect((await order(s, { partyId: other.partyId })).status).toBe(404);
    expect((await order(s, { farmId: other.farmId })).status).toBe(404);
    expect((await order(s, {}, [{ productId: other.productId, qty: 1, unitPrice: 1 }])).status).toBe(404);
    expect((await order(s, {}, [])).status).toBe(400);
    expect((await order(s, {}, [{ qty: 1, unitPrice: 100 }])).status).toBe(400);
    expect((await order(s, {}, [{ description: "Algo", category: "sale", qty: 1, unitPrice: 100 }])).status).toBe(400);
    expect((await order(s, {}, [{ productId: s.productId, qty: 0, unitPrice: 100 }])).status).toBe(400);
    const o = await order(s);
    expect((await receive(s, o.body.id, { warehouseId: other.whA })).status).toBe(404);
    expect((await receive(s, o.body.id, { lines: [{ lineId: crypto.randomUUID() }] })).status).toBe(404);
    expect((await erpPost(s.owner.token, `purchases/${o.body.id}/invoice`, { invoiceNumber: "", invoiceDate: "2026-11-02" })).status).toBe(400);
    expect((await erpGet(other.owner.token, `purchases/${o.body.id}`)).status).toBe(404);
  });

  it("permisos: son montos, solo dueño y administrador (el agrónomo y el empleado, no)", async () => {
    const s = await setup();
    expect((await order({ ...s, owner: s.admin } as S)).status).toBe(201);
    const o = await order(s);
    for (const who of [s.agro, s.worker]) {
      expect((await erpPost(who.token, "purchases", { orderDate: "2026-11-01", currency: "PYG", lines: [{ productId: s.productId, qty: 1, unitPrice: 1 }] })).status).toBe(403);
      expect((await erpGet(who.token, "purchases")).status).toBe(403);
      expect((await erpGet(who.token, `purchases/${o.body.id}`)).status).toBe(403);
      expect((await erpPost(who.token, `purchases/${o.body.id}/receive`, { warehouseId: s.whA, date: "2026-11-05" })).status).toBe(403);
      expect((await erpPost(who.token, `purchases/${o.body.id}/invoice`, { invoiceNumber: "1", invoiceDate: "2026-11-05" })).status).toBe(403);
      expect((await call("DELETE", `/org/erp/purchases/${o.body.id}`, { token: who.token })).status).toBe(403);
    }
  });
});
