/** E-05: costos y ventas con centro de costo (estancia, lote, campaña, actividad). El agrónomo no ve montos. */
import { describe, expect, it } from "vitest";
import { call, createFarmWithPlots, createOrgWithOwner } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

const cost = (extra: Record<string, unknown> = {}) => ({
  date: "2026-11-05",
  activity: "agricultura",
  category: "other",
  description: "Reparación de alambrado",
  amount: 1_500_000,
  currency: "PYG",
  ...extra,
});

describe("costos y ventas (E-05)", () => {
  it("un lote fija la estancia; el costo guarda centro de costo, moneda y valor en guaraníes", async () => {
    const { owner, farmId, plotIds } = await erpSetup();
    const season = await call<any>("POST", "/org/seasons", { token: owner.token, body: { name: "Zafra 2026/27" } });
    const r = await erpPost(owner.token, "costs", cost({ plotId: plotIds[0], seasonId: season.body.id }));
    expect(r.status).toBe(201);
    const list = await erpGet<any>(owner.token, "costs");
    expect(list.body.rows[0]).toMatchObject({
      farmId,
      plotId: plotIds[0],
      seasonId: season.body.id,
      activity: "agricultura",
      category: "other",
      amount: 1_500_000,
      amountPyg: 1_500_000,
      origin: "manual",
    });
    expect(list.body.totals).toEqual({ costPyg: 1_500_000, incomePyg: 0 });
  });

  it("monto en dólares: pide el tipo de cambio y convierte con el del día", async () => {
    const { owner } = await erpSetup();
    const usd = cost({ amount: 12_550, currency: "USD" });
    const no = await erpPost(owner.token, "costs", usd);
    expect(no.status).toBe(400);
    expect(no.body.error).toMatch(/tipo de cambio/);
    await call("PUT", "/org/erp/exchange-rates/2026-11-01", { token: owner.token, body: { usdToPyg: 7300 } });
    await call("PUT", "/org/erp/exchange-rates/2026-11-10", { token: owner.token, body: { usdToPyg: 7400 } });
    expect((await erpPost(owner.token, "costs", usd)).status).toBe(201);
    const row = (await erpGet<any>(owner.token, "costs")).body.rows[0];
    expect(row).toMatchObject({ amount: 12_550, currency: "USD", amountPyg: 916_150 });
    // al cambiar la fecha se recalcula con el tipo de cambio de ese día
    await call("PATCH", `/org/erp/costs/${row.id}`, { token: owner.token, body: { date: "2026-11-12" } });
    expect((await erpGet<any>(owner.token, "costs")).body.rows[0].amountPyg).toBe(928_700);
  });

  it("las ventas son ingresos: no suman como costo", async () => {
    const { owner } = await erpSetup();
    await erpPost(owner.token, "costs", cost());
    await erpPost(owner.token, "costs", cost({ category: "sale", description: "Soja", amount: 40_000_000, tons: 25 }));
    const r = await erpGet<any>(owner.token, "costs");
    expect(r.body.totals).toEqual({ costPyg: 1_500_000, incomePyg: 40_000_000 });
    expect(r.body.rows.find((x: any) => x.category === "sale").tons).toBe(25);
    const onlySales = await erpGet<any>(owner.token, "costs?category=sale");
    expect(onlySales.body.rows).toHaveLength(1);
  });

  it("filtra por lote, campaña y fechas", async () => {
    const { owner, plotIds } = await erpSetup();
    await erpPost(owner.token, "costs", cost({ plotId: plotIds[0], date: "2026-10-01" }));
    await erpPost(owner.token, "costs", cost({ plotId: plotIds[1], date: "2026-11-20" }));
    const byPlot = await erpGet<any>(owner.token, `costs?plotId=${plotIds[1]}`);
    expect(byPlot.body.rows).toHaveLength(1);
    const byDate = await erpGet<any>(owner.token, "costs?from=2026-11-01&to=2026-11-30");
    expect(byDate.body.rows.map((x: any) => x.plotId)).toEqual([plotIds[1]]);
    expect(byDate.body.totals.costPyg).toBe(1_500_000);
  });

  it("valida el centro de costo y que el lote sea de la organización", async () => {
    const { owner, farmId, plotIds } = await erpSetup();
    const other = await createOrgWithOwner("Otra");
    const foreign = await createFarmWithPlots(other.token, 1);
    expect((await erpPost(owner.token, "costs", cost({ plotId: foreign.plotIds[0] }))).status).toBe(404);
    expect((await erpPost(owner.token, "costs", cost({ farmId: foreign.farmId }))).status).toBe(404);
    expect((await erpPost(owner.token, "costs", cost({ seasonId: "11111111-1111-4111-8111-111111111111" }))).status).toBe(404);
    const second = await createFarmWithPlots(owner.token, 1);
    expect((await erpPost(owner.token, "costs", cost({ farmId: second.farmId, plotId: plotIds[0] }))).status).toBe(400);
    expect((await erpPost(owner.token, "costs", cost({ farmId, plotId: plotIds[0] }))).status).toBe(201);
    for (const bad of [{ amount: 0 }, { amount: 1.5 }, { activity: "x" }, { category: "x" }, { date: "5/11" }, { currency: "EUR" }]) {
      expect((await erpPost(owner.token, "costs", cost(bad))).status).toBe(400);
    }
  });

  it("dueño y administrador; el agrónomo y el empleado no ven ni cargan montos", async () => {
    const { owner, admin, agro, worker } = await erpSetup();
    const a = await erpPost(admin.token, "costs", cost());
    expect(a.status).toBe(201);
    expect((await erpGet<any>(owner.token, "costs")).body.rows).toHaveLength(1);
    for (const t of [agro.token, worker.token]) {
      expect((await erpGet(t, "costs")).status).toBe(403);
      expect((await erpPost(t, "costs", cost())).status).toBe(403);
      expect((await call("PATCH", `/org/erp/costs/${a.body.id}`, { token: t, body: { amount: 1 } })).status).toBe(403);
      expect((await call("DELETE", `/org/erp/costs/${a.body.id}`, { token: t })).status).toBe(403);
    }
  });

  it("borrado lógico y aislamiento entre organizaciones", async () => {
    const { owner } = await erpSetup();
    const other = await createOrgWithOwner("Otra");
    const a = await erpPost(owner.token, "costs", cost());
    expect((await call("PATCH", `/org/erp/costs/${a.body.id}`, { token: other.token, body: { amount: 5 } })).status).toBe(404);
    expect((await erpGet<any>(other.token, "costs")).body.rows).toEqual([]);
    expect((await call("DELETE", `/org/erp/costs/${a.body.id}`, { token: owner.token })).status).toBe(200);
    expect((await erpGet<any>(owner.token, "costs")).body).toEqual({ rows: [], totals: { costPyg: 0, incomePyg: 0 } });
  });
});
