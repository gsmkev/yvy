/** E-14: stock mínimo por producto y depósito con aviso de reposición. */
import { describe, expect, it } from "vitest";
import { belowMinimum } from "@yvy/shared";
import { call } from "./helpers";
import { buy, erpGet, erpPost, stockSetup } from "./erp-helpers";

const put = (token: string, body: unknown) => call("PUT", "/org/erp/stock/minimums", { token, body });

describe("stock mínimo (E-14)", () => {
  it("belowMinimum avisa en el mínimo o por debajo, ignora mínimo 0 y ordena por faltante", () => {
    const stock = [
      { productId: "a", warehouseId: "w", qty: 5 },
      { productId: "b", warehouseId: "w", qty: 50 },
    ];
    const r = belowMinimum(stock, [
      { productId: "a", warehouseId: "w", minQty: 10 },
      { productId: "b", warehouseId: "w", minQty: 50 },
      { productId: "c", warehouseId: "w", minQty: 4 },
      { productId: "d", warehouseId: "w", minQty: 0 },
    ]);
    expect(r.map((x) => [x.productId, x.missing])).toEqual([["a", 5], ["c", 4], ["b", 0]]);
  });

  it("avisa cuando el stock del depósito cae al mínimo y deja de avisar al reponer", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000);
    expect((await put(s.owner.token, { productId: s.productId, warehouseId: s.whA, minQty: 30 })).status).toBe(200);
    expect((await erpGet<any[]>(s.owner.token, "stock/low")).body).toEqual([]);
    await erpPost(s.owner.token, "stock/consumptions", { productId: s.productId, warehouseId: s.whA, date: "2026-11-06", qty: 75 });
    const low = (await erpGet<any[]>(s.owner.token, "stock/low")).body;
    expect(low).toEqual([{ productId: s.productId, warehouseId: s.whA, qty: 25, minQty: 30, missing: 5 }]);
    await buy(s.owner.token, s, 50, 500_000);
    expect((await erpGet<any[]>(s.owner.token, "stock/low")).body).toEqual([]);
  });

  it("guardar de nuevo cambia el mínimo (no duplica) y se puede borrar", async () => {
    const s = await stockSetup();
    await put(s.owner.token, { productId: s.productId, warehouseId: s.whA, minQty: 10 });
    await put(s.owner.token, { productId: s.productId, warehouseId: s.whA, minQty: 20 });
    const list = (await erpGet<any[]>(s.owner.token, "stock/minimums")).body;
    expect(list).toHaveLength(1);
    expect(list[0].minQty).toBe(20);
    expect((await call("DELETE", `/org/erp/stock/minimums/${list[0].id}`, { token: s.owner.token })).status).toBe(200);
    expect((await erpGet<any[]>(s.owner.token, "stock/minimums")).body).toEqual([]);
  });

  it("valida producto y depósito de la organización y el mínimo", async () => {
    const s = await stockSetup();
    const other = await stockSetup();
    expect((await put(s.owner.token, { productId: other.productId, warehouseId: s.whA, minQty: 1 })).status).toBe(404);
    expect((await put(s.owner.token, { productId: s.productId, warehouseId: other.whA, minQty: 1 })).status).toBe(404);
    expect((await put(s.owner.token, { productId: s.productId, warehouseId: s.whA, minQty: -1 })).status).toBe(400);
  });

  it("permisos: el agrónomo ve los avisos pero no cambia mínimos; el empleado no entra", async () => {
    const s = await stockSetup();
    await put(s.admin.token, { productId: s.productId, warehouseId: s.whA, minQty: 5 });
    expect((await put(s.agro.token, { productId: s.productId, warehouseId: s.whA, minQty: 1 })).status).toBe(403);
    expect((await put(s.worker.token, { productId: s.productId, warehouseId: s.whA, minQty: 1 })).status).toBe(403);
    expect((await erpGet<any[]>(s.agro.token, "stock/low")).status).toBe(200);
    expect((await erpGet<any[]>(s.agro.token, "stock/minimums")).status).toBe(200);
    expect((await erpGet<any[]>(s.worker.token, "stock/low")).status).toBe(403);
    expect((await call("DELETE", "/org/erp/stock/minimums/x", { token: s.agro.token })).status).toBe(403);
  });
});
