/** E-30 y E-31: costo por hectárea y por tonelada, y margen bruto por lote, cultivo, actividad y campaña. */
import { describe, expect, it } from "vitest";
import { resultFigures } from "@yvy/shared";
import { call, createOrgWithOwner } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";
import { push, rec } from "./records-helpers";

const cost = (extra: Record<string, unknown>) => ({ date: "2026-11-05", activity: "agricultura", category: "other", amount: 1, currency: "PYG", ...extra });

async function setup() {
  const s = await erpSetup();
  const season = await call<any>("POST", "/org/seasons", { token: s.owner.token, body: { name: "Zafra 2026/27" } });
  const farm = await call<any>("GET", `/org/farms/${s.farmId}`, { token: s.owner.token });
  const area = (id: string) => farm.body.plots.find((p: any) => p.id === id).areaHa as number;
  return { ...s, seasonId: season.body.id as string, area };
}
type S = Awaited<ReturnType<typeof setup>>;
const get = async (s: S, q = "") => (await erpGet<any>(s.owner.token, `results${q}`)).body;

async function load(s: S) {
  const [p0, p1] = s.plotIds as [string, string];
  const c = (extra: Record<string, unknown>) => erpPost(s.owner.token, "costs", cost({ seasonId: s.seasonId, ...extra }));
  await c({ plotId: p0, category: "input", amount: 1_000_000 });
  await c({ plotId: p0, category: "contractor", amount: 500_000 });
  await c({ plotId: p0, category: "sale", amount: 6_000_000, tons: 20 });
  await c({ plotId: p1, category: "input", amount: 300_000 });
  await c({ farmId: s.farmId, activity: "administracion", amount: 200_000 }); // sin lote
  await erpPost(s.owner.token, "costs", cost({ plotId: p1, amount: 999_000 })); // otra campaña (sin campaña)
  await push(s.owner.token, [rec(s.farmId, p0, "harvest", { seasonId: s.seasonId, tons: 20 })]);
}

describe("costo y margen (E-30, E-31)", () => {
  it("por lote: costo por ha y por tonelada, y margen", async () => {
    const s = await setup();
    await load(s);
    const r = await get(s, `?seasonId=${s.seasonId}`);
    const a = r.byPlot.find((x: any) => x.plotId === s.plotIds[0]);
    expect(a).toMatchObject({ costPyg: 1_500_000, incomePyg: 6_000_000, marginPyg: 4_500_000, tons: 20, costPerTon: 75_000 });
    expect(a.costPerHa).toBe(Math.round(1_500_000 / s.area(s.plotIds[0]!)));
    expect(a.marginPerHa).toBe(Math.round(4_500_000 / s.area(s.plotIds[0]!)));
    const b = r.byPlot.find((x: any) => x.plotId === s.plotIds[1]);
    expect(b).toMatchObject({ costPyg: 300_000, incomePyg: 0, marginPyg: -300_000, tons: 0, costPerTon: null });
    // lo que no tiene lote queda aparte y no tiene hectáreas
    expect(r.byPlot.find((x: any) => x.plotId === null)).toMatchObject({ costPyg: 200_000, costPerHa: null });
  });

  it("filtra por campaña (la compra sin campaña no entra) y por estancia", async () => {
    const s = await setup();
    await load(s);
    const all = await get(s);
    expect(all.totals.costPyg).toBe(1_500_000 + 300_000 + 200_000 + 999_000);
    const season = await get(s, `?seasonId=${s.seasonId}`);
    expect(season.totals).toMatchObject({ costPyg: 2_000_000, incomePyg: 6_000_000 });
    const other = await get(s, "?farmId=11111111-1111-4111-8111-111111111111");
    expect(other.totals.costPyg).toBe(0);
  });

  it("por actividad y por cultivo", async () => {
    const s = await setup();
    await load(s);
    const r = await get(s, `?seasonId=${s.seasonId}`);
    expect(r.byActivity.find((x: any) => x.activity === "agricultura")).toMatchObject({ costPyg: 1_800_000, incomePyg: 6_000_000, marginPyg: 4_200_000 });
    expect(r.byActivity.find((x: any) => x.activity === "administracion")).toMatchObject({ costPyg: 200_000 });
    expect(r.byCrop).toHaveLength(1);
    expect(r.byCrop[0]).toMatchObject({ crop: "soja", costPyg: 1_800_000, incomePyg: 6_000_000, tons: 20 });
  });

  it("por campaña: costos, ventas y margen de cada una, sin filtrar por campaña", async () => {
    const s = await setup();
    await load(s);
    const r = await get(s);
    const z = r.bySeason.find((x: any) => x.seasonId === s.seasonId);
    expect(z).toMatchObject({ name: "Zafra 2026/27", costPyg: 2_000_000, incomePyg: 6_000_000, marginPyg: 4_000_000 });
    // lo que no tiene campaña queda aparte
    expect(r.bySeason.find((x: any) => x.seasonId === null)).toMatchObject({ costPyg: 999_000, incomePyg: 0 });
  });

  it("las ventas de granos y de hacienda cuentan como ingreso", async () => {
    const s = await setup();
    const c = (extra: Record<string, unknown>) => erpPost(s.owner.token, "costs", cost({ seasonId: s.seasonId, ...extra }));
    await c({ plotId: s.plotIds[0], category: "sale", amount: 1_000_000, tons: 5 });
    await c({ farmId: s.farmId, activity: "ganaderia", category: "sale", amount: 4_000_000 });
    const r = await get(s, `?seasonId=${s.seasonId}`);
    expect(r.totals.incomePyg).toBe(5_000_000);
    expect(r.byActivity.find((x: any) => x.activity === "ganaderia")).toMatchObject({ incomePyg: 4_000_000 });
  });

  it("los costos que nacen del campo (consumo de insumos) entran solos", async () => {
    const s = await setup();
    const wh = await erpPost(s.owner.token, "warehouses", { farmId: s.farmId, name: "Galpón", type: "shed" });
    const p = await call<any>("POST", "/org/products", { token: s.owner.token, body: { name: "Glifosato", type: "agrochemical", unit: "l" } });
    await erpPost(s.owner.token, "stock/purchases", { productId: p.body.id, warehouseId: wh.body.id, date: "2026-11-05", qty: 100, amount: 1_000_000, currency: "PYG" });
    await push(s.owner.token, [rec(s.farmId, s.plotIds[0]!, "application", { seasonId: s.seasonId, products: [{ productId: p.body.id, name: "G", dose: 1, unit: "l_ha" }], areaHa: 10 })]);
    const r = await get(s, `?seasonId=${s.seasonId}`);
    expect(r.byPlot.find((x: any) => x.plotId === s.plotIds[0]).costPyg).toBe(100_000);
  });

  it("solo dueño y administrador; cada organización ve lo suyo", async () => {
    const s = await setup();
    await load(s);
    expect((await erpGet(s.admin.token, "results")).status).toBe(200);
    expect((await erpGet(s.agro.token, "results")).status).toBe(403);
    expect((await erpGet(s.worker.token, "results")).status).toBe(403);
    const other = await createOrgWithOwner("Otra");
    expect((await erpGet<any>(other.token, "results")).body.totals.costPyg).toBe(0);
  });
});

describe("resultFigures", () => {
  it("por hectárea, por tonelada y margen; sin base devuelve null", () => {
    expect(resultFigures({ costPyg: 1_500_000, incomePyg: 6_000_000, areaHa: 10, tons: 20 })).toEqual({
      marginPyg: 4_500_000,
      costPerHa: 150_000,
      incomePerHa: 600_000,
      marginPerHa: 450_000,
      costPerTon: 75_000,
    });
    expect(resultFigures({ costPyg: 100, incomePyg: 0, areaHa: 0, tons: 0 })).toEqual({ marginPyg: -100, costPerHa: null, incomePerHa: null, marginPerHa: null, costPerTon: null });
  });
});
