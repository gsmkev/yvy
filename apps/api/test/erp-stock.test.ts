/** E-11: movimientos de stock a costo promedio ponderado, transferencias, ajustes y permisos. */
import { describe, expect, it } from "vitest";
import { call, createOrgWithOwner } from "./helpers";
import { buy, erpGet, erpPost, stockSetup } from "./erp-helpers";

const summary = async (token: string) => (await erpGet<any>(token, "stock")).body;
const inWh = (sum: any, productId: string, whId: string) =>
  sum.rows.find((r: any) => r.productId === productId && r.warehouseId === whId);

describe("stock a costo promedio ponderado (E-11)", () => {
  it("el costo promedio pondera las compras y las salidas no lo cambian", async () => {
    const s = await stockSetup();
    expect((await buy(s.owner.token, s, 100, 1_000_000)).status).toBe(201); // 10.000 por l
    expect((await buy(s.owner.token, s, 100, 1_400_000)).status).toBe(201); // 14.000 por l
    let sum = await summary(s.owner.token);
    expect(sum.products[0]).toMatchObject({ productId: s.productId, qty: 200, valuePyg: 2_400_000, avgCostPyg: 12_000 });

    const c = await erpPost(s.owner.token, "stock/consumptions", { productId: s.productId, warehouseId: s.whA, date: "2026-11-06", qty: 50 });
    expect(c.status).toBe(201);
    sum = await summary(s.owner.token);
    expect(sum.products[0]).toMatchObject({ qty: 150, valuePyg: 1_800_000, avgCostPyg: 12_000 });
    const moves = (await erpGet<any[]>(s.owner.token, "stock/moves")).body;
    expect(moves.find((m) => m.origin === "consumption")).toMatchObject({ qty: -50, valuePyg: -600_000 });
  });

  it("una compra en dólares se valoriza en guaraníes con el tipo de cambio del día", async () => {
    const s = await stockSetup();
    const noRate = await buy(s.owner.token, s, 100, 10_000, { currency: "USD" });
    expect(noRate.status).toBe(400);
    await call("PUT", "/org/erp/exchange-rates/2026-11-01", { token: s.owner.token, body: { usdToPyg: 7300 } });
    expect((await buy(s.owner.token, s, 100, 10_000, { currency: "USD" })).status).toBe(201);
    const move = (await erpGet<any[]>(s.owner.token, "stock/moves")).body[0];
    expect(move).toMatchObject({ qty: 100, amount: 10_000, currency: "USD", valuePyg: 730_000 });
  });

  it("transferir mueve la cantidad entre depósitos sin cambiar el total ni el valor", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000);
    const t = await erpPost(s.owner.token, "stock/transfers", {
      productId: s.productId,
      fromWarehouseId: s.whA,
      toWarehouseId: s.whB,
      date: "2026-11-06",
      qty: 40,
    });
    expect(t.status).toBe(201);
    const sum = await summary(s.owner.token);
    expect(inWh(sum, s.productId, s.whA)).toMatchObject({ qty: 60, valuePyg: 600_000 });
    expect(inWh(sum, s.productId, s.whB)).toMatchObject({ qty: 40, valuePyg: 400_000 });
    expect(sum.products[0]).toMatchObject({ qty: 100, valuePyg: 1_000_000, avgCostPyg: 10_000 });
    // no se puede transferir más de lo que hay ni al mismo depósito
    const over = await erpPost(s.owner.token, "stock/transfers", { productId: s.productId, fromWarehouseId: s.whA, toWarehouseId: s.whB, date: "2026-11-06", qty: 61 });
    expect(over.status).toBe(409);
    const same = await erpPost(s.owner.token, "stock/transfers", { productId: s.productId, fromWarehouseId: s.whA, toWarehouseId: s.whA, date: "2026-11-06", qty: 1 });
    expect(same.status).toBe(400);
    // borrar la transferencia borra las dos patas
    expect((await call("DELETE", `/org/erp/stock/moves/${(await erpGet<any[]>(s.owner.token, "stock/moves")).body.find((m) => m.origin === "transfer").id}`, { token: s.owner.token })).status).toBe(200);
    const after = await summary(s.owner.token);
    expect(inWh(after, s.productId, s.whA)).toMatchObject({ qty: 100 });
    expect(inWh(after, s.productId, s.whB)?.qty ?? 0).toBe(0);
  });

  it("el ajuste suma o resta al costo promedio; no se puede restar más de lo que hay", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000);
    const adj = (qty: number) => erpPost(s.owner.token, "stock/adjustments", { productId: s.productId, warehouseId: s.whA, date: "2026-11-07", qty });
    expect((await adj(-10)).status).toBe(201);
    expect((await adj(5)).status).toBe(201);
    expect((await summary(s.owner.token)).products[0]).toMatchObject({ qty: 95, valuePyg: 950_000 });
    expect((await adj(-96)).status).toBe(409);
    expect((await adj(0)).status).toBe(400);
  });

  it("consumo manual a un lote carga el costo; al borrarlo se revierte el stock y el costo", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000);
    const c = await erpPost(s.owner.token, "stock/consumptions", { productId: s.productId, warehouseId: s.whA, date: "2026-11-06", qty: 10, plotId: s.plotIds[0] });
    let costs = (await erpGet<any>(s.owner.token, "costs")).body;
    expect(costs.rows).toHaveLength(1);
    expect(costs.rows[0]).toMatchObject({ category: "input", amountPyg: 100_000, plotId: s.plotIds[0], origin: "consumption", originId: c.body.id });
    expect((await call("DELETE", `/org/erp/stock/moves/${c.body.id}`, { token: s.owner.token })).status).toBe(200);
    costs = (await erpGet<any>(s.owner.token, "costs")).body;
    expect(costs.rows).toHaveLength(0);
    expect((await summary(s.owner.token)).products[0]).toMatchObject({ qty: 100, valuePyg: 1_000_000 });
  });

  it("sin stock suficiente no se consume a mano", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 5, 50_000);
    const r = await erpPost(s.owner.token, "stock/consumptions", { productId: s.productId, warehouseId: s.whA, date: "2026-11-06", qty: 6 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/hay 5/);
  });

  it("el agrónomo ve cantidades pero no montos; el empleado no entra; solo dueño y administrador cargan", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000);
    const sum = await summary(s.agro.token);
    expect(sum.products[0]).toEqual({ productId: s.productId, qty: 100 });
    expect(sum.rows[0]).toEqual({ productId: s.productId, warehouseId: s.whA, qty: 100 });
    const moves = (await erpGet<any[]>(s.agro.token, "stock/moves")).body;
    expect(moves).toHaveLength(1);
    expect(moves[0].qty).toBe(100);
    expect(moves[0]).not.toHaveProperty("valuePyg");
    expect(moves[0]).not.toHaveProperty("amount");
    expect(moves[0]).not.toHaveProperty("currency");
    expect((await buy(s.agro.token, s, 1, 1)).status).toBe(403);
    expect((await call("DELETE", `/org/erp/stock/moves/${moves[0].id}`, { token: s.agro.token })).status).toBe(403);
    for (const [path, body] of [
      ["stock/consumptions", { productId: s.productId, warehouseId: s.whA, date: "2026-11-06", qty: 1 }],
      ["stock/transfers", { productId: s.productId, fromWarehouseId: s.whA, toWarehouseId: s.whB, date: "2026-11-06", qty: 1 }],
      ["stock/adjustments", { productId: s.productId, warehouseId: s.whA, date: "2026-11-06", qty: 1 }],
    ] as const)
      expect((await erpPost(s.agro.token, path, body)).status).toBe(403);
    expect((await erpGet(s.worker.token, "stock")).status).toBe(403);
    expect((await erpGet(s.worker.token, "stock/moves")).status).toBe(403);
    expect((await buy(s.worker.token, s, 1, 1)).status).toBe(403);
    expect((await buy(s.admin.token, s, 1, 1)).status).toBe(201);
  });

  it("productos y depósitos de otra organización no se usan; un depósito con stock no se borra", async () => {
    const s = await stockSetup();
    const other = await createOrgWithOwner("Otra");
    const foreign = await call<any>("POST", "/org/products", { token: other.token, body: { name: "Ajeno", type: "other", unit: "kg" } });
    expect((await buy(s.owner.token, { productId: foreign.body.id, whA: s.whA }, 1, 1)).status).toBe(404);
    expect((await buy(s.owner.token, { productId: s.productId, whA: "11111111-1111-4111-8111-111111111111" }, 1, 1)).status).toBe(404);
    expect((await summary(other.token)).rows).toEqual([]);
    await buy(s.owner.token, s, 1, 1);
    expect((await call("DELETE", `/org/erp/warehouses/${s.whA}`, { token: s.owner.token })).status).toBe(409);
    expect((await call("DELETE", `/org/erp/warehouses/${s.whB}`, { token: s.owner.token })).status).toBe(200);
  });
});
