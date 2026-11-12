/** E-15: recuento físico de un depósito desde la app (registro stock_count) asentado como ajustes de stock. */
import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { call } from "./helpers";
import { buy, erpGet, erpPost, stockSetup } from "./erp-helpers";
import { push, rec } from "./records-helpers";

type S = Awaited<ReturnType<typeof stockSetup>>;
const count = (s: S, lines: { productId: string; counted: number }[], extra: Record<string, unknown> = {}, wh = s.whA) =>
  rec(s.farmId, null, "stock_count", { warehouseId: wh, lines, ...extra });
const qty = async (s: S, token = s.owner.token) => (await erpGet<any>(token, "stock")).body.rows.find((r: any) => r.productId === s.productId && r.warehouseId === s.whA)?.qty;
const adjustments = async (s: S) => (await erpGet<any[]>(s.owner.token, "stock/moves")).body.filter((m) => m.origin === "adjustment");

describe("recuento de inventario desde la app (E-15)", () => {
  it("lo contado deja el stock igual al recuento: ajuste negativo (faltante) con valor al costo promedio", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000);
    const m = count(s, [{ productId: s.productId, counted: 92.5 }]);
    expect((await push(s.agro.token, [m])).body.results[0].status).toBe("applied");
    expect(await qty(s)).toBe(92.5);
    const adj = await adjustments(s);
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ qty: -7.5, valuePyg: -75_000, originId: m.row.id, warehouseId: s.whA });
    const total = (await erpGet<any>(s.owner.token, "stock")).body.products[0];
    expect(total).toMatchObject({ qty: 92.5, valuePyg: 925_000 });
  });

  it("un sobrante suma stock; lo que ya coincide no genera ajuste; otro depósito no se toca", async () => {
    const s = await stockSetup();
    const other = await call<any>("POST", "/org/products", { token: s.owner.token, body: { name: "Urea", type: "fertilizer", unit: "kg" } });
    await buy(s.owner.token, s, 50, 500_000);
    await erpPost(s.owner.token, "stock/purchases", { productId: other.body.id, warehouseId: s.whA, date: "2026-11-05", qty: 10, amount: 100_000, currency: "PYG" });
    await erpPost(s.owner.token, "stock/purchases", { productId: s.productId, warehouseId: s.whB, date: "2026-11-05", qty: 5, amount: 50_000, currency: "PYG" });
    await push(s.owner.token, [count(s, [{ productId: s.productId, counted: 55 }, { productId: other.body.id, counted: 10 }])]);
    expect(await qty(s)).toBe(55);
    const adj = await adjustments(s);
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ qty: 5, valuePyg: 50_000 });
    const rows = (await erpGet<any>(s.owner.token, "stock")).body.rows;
    expect(rows.find((r: any) => r.warehouseId === s.whB).qty).toBe(5);
  });

  it("recontar el mismo registro (editarlo) reemplaza sus ajustes contra el stock sin ellos; borrarlo los revierte", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000);
    const m = count(s, [{ productId: s.productId, counted: 80 }]);
    await push(s.owner.token, [m]);
    expect(await qty(s)).toBe(80);
    await push(s.owner.token, [{ ...m, mutationId: newId(), row: { ...m.row, data: { warehouseId: s.whA, lines: [{ productId: s.productId, counted: 95 }] } } }]);
    expect(await qty(s)).toBe(95);
    expect(await adjustments(s)).toHaveLength(1);
    await push(s.owner.token, [{ mutationId: newId(), kind: "records.delete", row: { id: m.row.id } }]);
    expect(await qty(s)).toBe(100);
    expect(await adjustments(s)).toHaveLength(0);
  });

  it("un recuento posterior parte del stock que dejó el anterior, y un producto sin stock previo se asienta como alta", async () => {
    const s = await stockSetup();
    await push(s.owner.token, [count(s, [{ productId: s.productId, counted: 12 }])]);
    expect(await qty(s)).toBe(12);
    await push(s.owner.token, [count(s, [{ productId: s.productId, counted: 10 }])]);
    expect(await qty(s)).toBe(10);
    expect(await adjustments(s)).toHaveLength(2);
  });

  it("el ajuste de un recuento no se borra a mano; se corrige el recuento", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 10, 100_000);
    await push(s.owner.token, [count(s, [{ productId: s.productId, counted: 8 }])]);
    const [adj] = await adjustments(s);
    expect((await call("DELETE", `/org/erp/stock/moves/${adj.id}`, { token: s.owner.token })).status).toBe(409);
  });

  it("valida el registro; depósito o producto ajenos no generan ajustes", async () => {
    const s = await stockSetup();
    const other = await stockSetup();
    const st = async (m: any) => (await push(s.owner.token, [m])).body.results[0];
    expect((await st(count(s, []))).status).toBe("rejected");
    expect((await st(count(s, [{ productId: s.productId, counted: -1 }]))).status).toBe("rejected");
    expect((await st(count(s, [{ productId: s.productId, counted: 1 }, { productId: s.productId, counted: 2 }]))).status).toBe("rejected");
    expect((await st(rec(s.farmId, null, "stock_count", { lines: [{ productId: s.productId, counted: 1 }] }))).status).toBe("rejected");
    expect((await st(count(s, [{ productId: s.productId, counted: 5 }], {}, other.whA))).status).toBe("applied");
    expect((await st(count(s, [{ productId: other.productId, counted: 5 }]))).status).toBe("applied");
    expect(await adjustments(s)).toHaveLength(0);
    expect(await adjustments(other)).toHaveLength(0);
  });

  it("permisos: dueño, administrador y agrónomo cuentan; el empleado no (y no recibe los depósitos)", async () => {
    const s = await stockSetup();
    for (const who of [s.owner, s.admin, s.agro])
      expect((await push(who.token, [count(s, [{ productId: s.productId, counted: 1 }])])).body.results[0].status).toBe("applied");
    const w = (await push(s.worker.token, [count(s, [{ productId: s.productId, counted: 1 }])])).body.results[0];
    expect(w).toMatchObject({ status: "rejected", reason: "forbidden" });
    const pull = async (token: string) => (await call<any>("POST", "/sync/pull", { token, body: { table: "warehouses", cursor: null } })).body.rows;
    expect((await pull(s.agro.token)).map((r: any) => r.id).sort()).toEqual([s.whA, s.whB].sort());
    expect(await pull(s.worker.token)).toEqual([]);
  });

  it("los cambios de depósito bajan al celular con su versión (alta, predeterminado y baja)", async () => {
    const s = await stockSetup();
    const pull = async () => (await call<any>("POST", "/sync/pull", { token: s.owner.token, body: { table: "warehouses", cursor: null } })).body.rows;
    let rows = await pull();
    expect(rows.find((r: any) => r.id === s.whA).isDefault).toBe(true);
    await call("PATCH", `/org/erp/warehouses/${s.whB}`, { token: s.owner.token, body: { isDefault: true } });
    rows = await pull();
    expect(Object.fromEntries(rows.map((r: any) => [r.id, r.isDefault]))).toEqual({ [s.whA]: false, [s.whB]: true });
    await call("DELETE", `/org/erp/warehouses/${s.whA}`, { token: s.owner.token });
    expect((await pull()).find((r: any) => r.id === s.whA).deletedAt).not.toBeNull();
  });
});
