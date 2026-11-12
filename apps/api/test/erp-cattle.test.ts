/** E-35 (y G-40): compras y ventas de hacienda con cabezas, kilos, precio y guía; costo por kilo de carne. */
import { describe, expect, it } from "vitest";
import { cattleFigures, costPerKgBeef } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

async function setup() {
  const s = await erpSetup();
  const party = await erpPost(s.owner.token, "parties", { name: "Frigorífico Sur", kind: "both" });
  return { ...s, partyId: party.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;
const deal = (s: S, extra: Record<string, unknown> = {}) =>
  erpPost(s.owner.token, "cattle-deals", { kind: "sell", date: "2026-11-05", partyId: s.partyId, farmId: s.farmId, category: "novillo", heads: 20, totalKg: 9000, amount: 72_000_000, currency: "PYG", guideNumber: "G-0001234", ...extra });

describe("compra y venta de hacienda (E-35, G-40)", () => {
  it("funciones puras: precio por kilo, kilos por cabeza y costo por kilo de carne", () => {
    expect(cattleFigures(72_000_000, 9000, 20)).toEqual({ pricePerKg: 8000, kgPerHead: 450 });
    expect(cattleFigures(1, 0, 0)).toEqual({ pricePerKg: null, kgPerHead: null });
    expect(costPerKgBeef(45_000_000, 9000)).toBe(5000);
    expect(costPerKgBeef(1000, 0)).toBeNull();
  });

  it("una venta carga un ingreso de ganadería con toneladas (kilos / 1000) y guarda la guía", async () => {
    const s = await setup();
    const r = await deal(s);
    expect(r.status).toBe(201);
    const list = (await erpGet<any[]>(s.owner.token, "cattle-deals")).body;
    expect(list[0]).toMatchObject({ kind: "sell", heads: 20, totalKg: 9000, pricePerKg: 8000, kgPerHead: 450, guideNumber: "G-0001234", amountPyg: 72_000_000 });
    const c = (await erpGet<any>(s.owner.token, "costs")).body;
    expect(c.rows[0]).toMatchObject({ category: "sale", activity: "ganaderia", amountPyg: 72_000_000, tons: 9, origin: "cattle", originId: r.body.id, farmId: s.farmId, partyId: s.partyId });
    expect(c.totals.incomePyg).toBe(72_000_000);
  });

  it("una compra carga un costo de ganadería (sin toneladas) y el listado filtra por tipo", async () => {
    const s = await setup();
    await deal(s, { kind: "buy", heads: 30, totalKg: 6000, amount: 30_000_000, guideNumber: "G-9" });
    await deal(s);
    const c = (await erpGet<any>(s.owner.token, "costs")).body;
    expect(c.rows.find((x: any) => x.category === "other")).toMatchObject({ activity: "ganaderia", amountPyg: 30_000_000, tons: null });
    expect((await erpGet<any[]>(s.owner.token, "cattle-deals?kind=buy")).body).toHaveLength(1);
    expect((await erpGet<any[]>(s.owner.token, "cattle-deals?kind=foo")).status).toBe(400);
  });

  it("el informe de resultados da el costo por kilo de carne con los kilos vendidos", async () => {
    const s = await setup();
    expect((await erpGet<any>(s.owner.token, "results")).body.beef).toEqual({ kgSold: 0, costPyg: 0, incomePyg: 0, costPerKgPyg: null });
    await deal(s, { kind: "buy", heads: 30, totalKg: 6000, amount: 30_000_000 });
    await erpPost(s.owner.token, "costs", { date: "2026-11-06", activity: "ganaderia", category: "other", amount: 15_000_000, currency: "PYG", farmId: s.farmId });
    await deal(s);
    const { beef } = (await erpGet<any>(s.owner.token, "results")).body;
    expect(beef).toEqual({ kgSold: 9000, costPyg: 45_000_000, incomePyg: 72_000_000, costPerKgPyg: 5000 });
  });

  it("USD con tipo de cambio; borrar la operación borra su ingreso; valida referencias, kilos y cabezas", async () => {
    const s = await setup();
    const other = await setup();
    expect((await deal(s, { currency: "USD", amount: 10_000 })).status).toBe(400);
    await call("PUT", "/org/erp/exchange-rates/2026-11-01", { token: s.owner.token, body: { usdToPyg: 7000 } });
    const r = await deal(s, { currency: "USD", amount: 1_000_000 });
    expect((await erpGet<any[]>(s.owner.token, "cattle-deals")).body[0].amountPyg).toBe(70_000_000);
    expect((await call("DELETE", `/org/erp/cattle-deals/${r.body.id}`, { token: s.owner.token })).status).toBe(200);
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toEqual([]);
    expect((await call("DELETE", `/org/erp/cattle-deals/${r.body.id}`, { token: s.owner.token })).status).toBe(404);
    expect((await deal(s, { partyId: other.partyId })).status).toBe(404);
    expect((await deal(s, { farmId: other.farmId })).status).toBe(404);
    expect((await deal(s, { heads: 0 })).status).toBe(400);
    expect((await deal(s, { heads: 1.5 })).status).toBe(400);
    expect((await deal(s, { totalKg: 0 })).status).toBe(400);
    expect((await deal(s, { kind: "regalo" })).status).toBe(400);
  });

  it("permisos: son montos, solo dueño y administrador (el agrónomo y el empleado, no)", async () => {
    const s = await setup();
    expect((await deal({ ...s, owner: s.admin } as S)).status).toBe(201);
    for (const who of [s.agro, s.worker]) {
      expect((await erpGet(who.token, "cattle-deals")).status).toBe(403);
      expect((await erpPost(who.token, "cattle-deals", { kind: "sell", date: "2026-11-05", heads: 1, totalKg: 1, amount: 1, currency: "PYG" })).status).toBe(403);
      expect((await call("DELETE", "/org/erp/cattle-deals/x", { token: who.token })).status).toBe(403);
    }
  });
});
