/** E-13: un registro de campo con productos del catálogo descuenta stock y carga costo (idempotente, reversible). */
import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { call, createOrgWithOwner, pullAll } from "./helpers";
import { buy, erpGet, erpPost, stockSetup } from "./erp-helpers";
import { push, rec } from "./records-helpers";

/** Organización con galpón predeterminado, 100 l de glifosato a 10.000 por l y 1.000 kg de urea a 5.000 por kg. */
async function setup() {
  const s = await stockSetup();
  await buy(s.owner.token, s, 100, 1_000_000);
  const urea = await call<any>("POST", "/org/products", { token: s.owner.token, body: { name: "Urea", type: "fertilizer", unit: "kg" } });
  await erpPost(s.owner.token, "stock/purchases", { productId: urea.body.id, warehouseId: s.whA, date: "2026-11-05", qty: 1000, amount: 5_000_000, currency: "PYG" });
  return { ...s, ureaId: urea.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;

const gly = (s: S, dose: number, unit = "l_ha") => ({ productId: s.productId, name: "Glifosato", dose, unit });
const app = (products: unknown[], extra: Record<string, unknown> = {}) => ({ products, ...extra });
const stock = async (s: S) => (await erpGet<any>(s.owner.token, "stock")).body;
const qtyOf = async (s: S, productId: string) => (await stock(s)).products.find((p: any) => p.productId === productId)?.qty;
const costs = async (s: S) => (await erpGet<any>(s.owner.token, "costs")).body;
const activeMoves = async (s: S) => (await erpGet<any[]>(s.owner.token, "stock/moves")).body.filter((m) => m.origin === "consumption");

describe("consumo automático de los registros de campo (E-13)", () => {
  it("una aplicación descuenta dosis x superficie a costo promedio y carga un costo al lote", async () => {
    const s = await setup();
    const m = rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 2)], { areaHa: 10, seasonId: undefined }));
    expect((await push(s.owner.token, [m])).body.results[0].status).toBe("applied");
    expect(await qtyOf(s, s.productId)).toBe(80);
    const moves = await activeMoves(s);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ qty: -20, valuePyg: -200_000, originId: m.row.id, warehouseId: s.whA });
    const c = (await costs(s)).rows;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      category: "input",
      activity: "agricultura",
      plotId: s.plotIds[0],
      farmId: s.farmId,
      amountPyg: 200_000,
      currency: "PYG",
      origin: "consumption",
      originId: m.row.id,
      productId: s.productId,
    });
  });

  it("convierte ml/ha y g/ha; una fertilización descuenta kg y suma varios productos en un solo costo", async () => {
    const s = await setup();
    const m1 = rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 500, "ml_ha")], { areaHa: 10 }));
    const m2 = rec(s.farmId, s.plotIds[1]!, "fertilization", {
      products: [{ productId: s.ureaId, name: "Urea", dose: 100, unit: "kg_ha" }],
      method: "broadcast",
      areaHa: 10,
    });
    await push(s.owner.token, [m1, m2]);
    expect(await qtyOf(s, s.productId)).toBe(95);
    expect(await qtyOf(s, s.ureaId)).toBe(0);
    const c = (await costs(s)).rows;
    expect(c.map((x: any) => x.amountPyg).sort((a: number, b: number) => a - b)).toEqual([50_000, 5_000_000]);
    // mezcla de dos productos en una misma aplicación: dos salidas y un solo costo
    const mix = rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 1), { productId: s.ureaId, name: "Urea", dose: 1, unit: "kg_ha" }], { areaHa: 1 }));
    await push(s.owner.token, [mix]);
    expect((await activeMoves(s)).filter((m) => m.originId === mix.row.id)).toHaveLength(2);
    expect((await costs(s)).rows.filter((x: any) => x.originId === mix.row.id)).toHaveLength(1);
  });

  it("sin superficie en el registro usa la del lote", async () => {
    const s = await setup();
    const farm = await call<any>("GET", `/org/farms/${s.farmId}`, { token: s.owner.token });
    const area = farm.body.plots.find((p: any) => p.id === s.plotIds[0]).areaHa;
    await push(s.owner.token, [rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 0.01)]))]);
    const m = (await activeMoves(s))[0];
    expect(m.qty).toBeCloseTo(-0.01 * area, 2);
  });

  it("idempotente: reenviar el mismo registro no duplica el consumo ni el costo", async () => {
    const s = await setup();
    const m = rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 2)], { areaHa: 10 }));
    await push(s.owner.token, [m]);
    // mismo envío (mismo mutationId): duplicado
    expect((await push(s.owner.token, [m])).body.results[0].status).toBe("duplicate");
    // mismo registro con otro mutationId (reintento del celular): reemplaza, no suma
    await push(s.owner.token, [{ ...m, mutationId: newId() }]);
    await push(s.owner.token, [{ ...m, mutationId: newId() }]);
    expect(await qtyOf(s, s.productId)).toBe(80);
    expect(await activeMoves(s)).toHaveLength(1);
    expect((await costs(s)).rows).toHaveLength(1);
  });

  it("editar el registro revierte lo anterior y arma lo nuevo; borrarlo devuelve el stock y quita el costo", async () => {
    const s = await setup();
    // otra compra más cara: costo promedio 12.000
    await buy(s.owner.token, s, 100, 1_400_000);
    const m = rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 2)], { areaHa: 10 }));
    await push(s.owner.token, [m]);
    expect((await activeMoves(s))[0]).toMatchObject({ qty: -20, valuePyg: -240_000 });
    // edición: menos superficie. El costo promedio no se distorsiona con la salida que se reemplaza.
    const edit = { ...m, mutationId: newId(), row: { ...m.row, data: app([gly(s, 2)], { areaHa: 5 }) } };
    expect((await push(s.owner.token, [edit])).body.results[0].status).toBe("applied");
    expect(await qtyOf(s, s.productId)).toBe(190);
    expect(await activeMoves(s)).toHaveLength(1);
    expect((await activeMoves(s))[0]).toMatchObject({ qty: -10, valuePyg: -120_000 });
    expect((await costs(s)).rows[0].amountPyg).toBe(120_000);
    // borrado
    const del = { mutationId: newId(), kind: "records.delete", row: { id: m.row.id } };
    expect((await push(s.owner.token, [del])).body.results[0].status).toBe("applied");
    expect(await qtyOf(s, s.productId)).toBe(200);
    expect(await activeMoves(s)).toHaveLength(0);
    expect((await costs(s)).rows).toHaveLength(0);
    expect((await stock(s)).products.find((p: any) => p.productId === s.productId)).toMatchObject({ valuePyg: 2_400_000 });
  });

  it("varios consumos seguidos usan el mismo costo promedio", async () => {
    const s = await setup();
    await buy(s.owner.token, s, 100, 1_400_000); // 200 l a 12.000 de promedio
    await push(s.owner.token, [
      rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 1)], { areaHa: 50 })),
      rec(s.farmId, s.plotIds[1]!, "application", app([gly(s, 1)], { areaHa: 50 })),
    ]);
    expect((await activeMoves(s)).map((m) => m.valuePyg)).toEqual([-600_000, -600_000]);
    expect((await stock(s)).products.find((p: any) => p.productId === s.productId)).toMatchObject({ qty: 100, valuePyg: 1_200_000, avgCostPyg: 12_000 });
  });

  it("un tratamiento sanitario con producto del catálogo y cantidad descuenta y carga costo a ganadería", async () => {
    const s = await setup();
    const vac = await call<any>("POST", "/org/products", { token: s.owner.token, body: { name: "Aftosa", type: "veterinary", unit: "l" } });
    await erpPost(s.owner.token, "stock/purchases", { productId: vac.body.id, warehouseId: s.whA, date: "2026-11-05", qty: 10, amount: 300_000, currency: "PYG" });
    await call("PATCH", `/org/plots/${s.plotIds[1]}`, { token: s.owner.token, body: { kind: "pasture" } });
    await push(s.owner.token, [
      rec(s.farmId, s.plotIds[1]!, "health", { reason: "aftosa", product: "Aftosa", productId: vac.body.id, quantity: 2, counts: { vaca: 40 } }),
    ]);
    expect(await qtyOf(s, vac.body.id)).toBe(8);
    expect((await costs(s)).rows[0]).toMatchObject({ category: "input", activity: "ganaderia", amountPyg: 60_000 });
    // sin productId o sin cantidad no pasa nada
    await push(s.owner.token, [rec(s.farmId, s.plotIds[1]!, "health", { reason: "aftosa", product: "Aftosa", counts: { vaca: 5 } })]);
    await push(s.owner.token, [rec(s.farmId, s.plotIds[1]!, "health", { reason: "aftosa", product: "Aftosa", productId: vac.body.id, counts: { vaca: 5 } })]);
    expect(await qtyOf(s, vac.body.id)).toBe(8);
  });

  it("productos a mano, de otra organización o con dosis de otra familia no consumen", async () => {
    const s = await setup();
    const other = await createOrgWithOwner("Otra");
    const foreign = await call<any>("POST", "/org/products", { token: other.token, body: { name: "Ajeno", type: "other", unit: "l" } });
    await push(s.owner.token, [
      rec(s.farmId, s.plotIds[0]!, "application", app([{ name: "Mezcla del vecino", dose: 2, unit: "l_ha" }], { areaHa: 10 })),
      rec(s.farmId, s.plotIds[0]!, "application", app([{ productId: foreign.body.id, name: "Ajeno", dose: 2, unit: "l_ha" }], { areaHa: 10 })),
      rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 2, "kg_ha")], { areaHa: 10 })),
    ]);
    expect(await qtyOf(s, s.productId)).toBe(100);
    expect(await activeMoves(s)).toHaveLength(0);
    expect((await costs(s)).rows).toHaveLength(0);
  });

  it("sin depósito en la estancia el registro se guarda igual, sin consumo", async () => {
    const s = await setup();
    const { createFarmWithPlots } = await import("./helpers");
    const second = await createFarmWithPlots(s.owner.token, 1);
    const m = rec(second.farmId, second.plotIds[0]!, "application", app([gly(s, 2)], { areaHa: 10 }));
    expect((await push(s.owner.token, [m])).body.results[0].status).toBe("applied");
    expect(await qtyOf(s, s.productId)).toBe(100);
  });

  it("el stock puede quedar negativo: el campo no espera a la oficina", async () => {
    const s = await setup();
    await push(s.owner.token, [rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 20)], { areaHa: 10 }))]);
    expect(await qtyOf(s, s.productId)).toBe(-100);
  });

  it("un empleado dispara el consumo con sus registros pero no ve el stock", async () => {
    const s = await setup();
    await push(s.worker.token, [rec(s.farmId, s.plotIds[0]!, "application", app([gly(s, 2)], { areaHa: 10 }))]);
    expect(await qtyOf(s, s.productId)).toBe(80);
    expect((await erpGet(s.worker.token, "stock")).status).toBe(403);
    expect((await erpGet(s.worker.token, "costs")).status).toBe(403);
    expect((await erpGet<any>(s.agro.token, "costs")).status).toBe(403);
    expect(await pullAll(s.worker.token, "records")).toHaveLength(1);
  });

  it("respeta los límites: 60 salidas en un push entran sin pasar los 100 parámetros; más, se pide dividir", async () => {
    const s = await setup();
    const two = (i: number) =>
      rec(s.farmId, s.plotIds[i % 2]!, "application", app([gly(s, 0.1), { productId: s.ureaId, name: "Urea", dose: 1, unit: "kg_ha" }], { areaHa: 1 }));
    // 30 registros x 2 productos = 60 salidas de stock y 30 costos
    const ok = await push(s.owner.token, Array.from({ length: 30 }, (_, i) => two(i)));
    expect(ok.status).toBe(200);
    expect(ok.body.results.every((r: any) => r.status === "applied")).toBe(true);
    expect(await activeMoves(s)).toHaveLength(60);
    expect((await costs(s)).rows).toHaveLength(30);
    // 31 registros = 62 salidas: el servidor pide dividir (503) y no guarda nada del envío
    const big = await push(s.owner.token, Array.from({ length: 31 }, (_, i) => two(i)));
    expect(big.status).toBe(503);
    expect(await activeMoves(s)).toHaveLength(60);
    expect(await pullAll(s.owner.token, "records")).toHaveLength(30);
  });
});
