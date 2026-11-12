/** G-33: feedlot. Raciones, suministro por corral (descuenta stock y carga costo) y conversión con las pesadas. */
import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";
import { push, rec } from "./records-helpers";

const DAY = 86_400_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function setup() {
  const s = await erpSetup();
  const wh = await erpPost(s.owner.token, "warehouses", { farmId: s.farmId, name: "Galpón", type: "shed" });
  const prod = async (name: string, kg: number, amount: number) => {
    const p = await call<any>("POST", "/org/products", { token: s.owner.token, body: { name, type: "other", unit: "kg" } });
    await erpPost(s.owner.token, "stock/purchases", { productId: p.body.id, warehouseId: wh.body.id, date: "2026-11-05", qty: kg, amount, currency: "PYG" });
    return p.body.id as string;
  };
  const maiz = await prod("Maíz grano", 10_000, 20_000_000);
  const silaje = await prod("Silaje de maíz", 50_000, 25_000_000);
  return { ...s, maiz, silaje };
}
type S = Awaited<ReturnType<typeof setup>>;
const stockOf = async (s: S, id: string) => (await erpGet<any>(s.owner.token, "stock")).body.products.find((p: any) => p.productId === id);
const ration = (s: S) => ({
  name: "Terminación",
  items: [
    { productId: s.maiz, pctDm: 60, dmPct: 88 },
    { productId: s.silaje, pctDm: 40, dmPct: 35 },
  ],
});
const feed = (s: S, plotId: string, kgDm: number, at: number) =>
  rec(
    s.farmId,
    plotId,
    "feed",
    {
      ration: "Terminación",
      kgDm,
      items: [
        { productId: s.maiz, name: "Maíz grano", kg: (kgDm * 0.6) / 0.88 },
        { productId: s.silaje, name: "Silaje de maíz", kg: (kgDm * 0.4) / 0.35 },
      ],
    },
    at,
  );

describe("raciones (G-33)", () => {
  it("el dueño y el administrador las cargan; los porcentajes tienen que sumar 100 y los productos ser del catálogo", async () => {
    const s = await setup();
    const ok = await erpPost(s.owner.token, "feedlot/rations", ration(s));
    expect(ok.status).toBe(201);
    expect((await erpPost(s.admin.token, "feedlot/rations", { ...ration(s), name: "Recría" })).status).toBe(201);
    const bad = await erpPost(s.owner.token, "feedlot/rations", { ...ration(s), items: [{ productId: s.maiz, pctDm: 60 }] });
    expect(bad.status).toBe(400);
    const stranger = await erpPost(s.owner.token, "feedlot/rations", { name: "X", items: [{ productId: newId(), pctDm: 100 }] });
    expect(stranger.status).toBe(400);
    const list = await erpGet<any[]>(s.owner.token, "feedlot/rations");
    expect(list.body.map((r) => r.name)).toEqual(["Recría", "Terminación"]);
    expect(list.body[1].items[0]).toMatchObject({ productId: s.maiz, pctDm: 60, dmPct: 88 });
    const edit = await call("PUT", `/org/erp/feedlot/rations/${ok.body.id}`, { token: s.owner.token, body: { ...ration(s), name: "Terminación 2" } });
    expect(edit.status).toBe(200);
    expect((await call("DELETE", `/org/erp/feedlot/rations/${ok.body.id}`, { token: s.owner.token })).status).toBe(200);
    expect((await erpGet<any[]>(s.owner.token, "feedlot/rations")).body).toHaveLength(1);
  });

  it("el agrónomo y el empleado no las ven ni las tocan", async () => {
    const s = await setup();
    for (const t of [s.agro.token, s.worker.token]) {
      expect((await erpGet(t, "feedlot/rations")).status).toBe(403);
      expect((await erpPost(t, "feedlot/rations", ration(s))).status).toBe(403);
      expect((await erpGet(t, `feedlot/report?from=2026-11-01&to=2026-11-30`)).status).toBe(403);
    }
  });
});

describe("suministro por corral (G-33)", () => {
  it("descuenta el stock de los ingredientes, carga el costo a la ganadería y se revierte al editar o borrar", async () => {
    const s = await setup();
    const m = feed(s, s.plotIds[1]!, 100, Date.now() - 1000);
    expect((await push(s.owner.token, [m])).body.results[0].status).toBe("applied");
    // 100 kg de MS: maíz 60/0,88 = 68,18 kg y silaje 40/0,35 = 114,29 kg
    expect((await stockOf(s, s.maiz)).qty).toBeCloseTo(10_000 - 68.18, 1);
    expect((await stockOf(s, s.silaje)).qty).toBeCloseTo(50_000 - 114.29, 1);
    const costs = (await erpGet<any>(s.owner.token, "costs")).body.rows;
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ category: "input", activity: "ganaderia", origin: "consumption", originId: m.row.id, description: "Terminación" });
    expect(Math.abs(costs[0].amountPyg - 193_500)).toBeLessThan(500); // 68,18 kg a 2.000 y 114,29 kg a 500
    await push(s.owner.token, [{ mutationId: newId(), kind: "records.delete", row: { id: m.row.id } }]);
    expect((await stockOf(s, s.maiz)).qty).toBe(10_000);
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toHaveLength(0);
  });

  it("el empleado no puede cargar suministros", async () => {
    const s = await setup();
    const r = await push(s.worker.token, [feed(s, s.plotIds[0]!, 50, Date.now() - 1000)]);
    expect(r.body.results[0].status).toBe("rejected");
    expect(r.body.results[0].reason).toBe("forbidden");
    expect((await stockOf(s, s.maiz)).qty).toBe(10_000);
  });
});

describe("conversión por corral (G-33)", () => {
  it("kg de materia seca por kg ganado entre la primera y la última pesada", async () => {
    const s = await setup();
    const corral = s.plotIds[1]!;
    const t0 = Date.now() - 30 * DAY;
    const weigh = (kg: number, head: number, at: number) => rec(s.farmId, corral, "weighing", { kg, head }, at);
    await push(s.owner.token, [weigh(300, 50, t0), feed(s, corral, 500, t0 + 5 * DAY), feed(s, corral, 500, t0 + 15 * DAY), weigh(330, 50, t0 + 20 * DAY), feed(s, corral, 500, t0 + 25 * DAY)]);
    const r = await erpGet<any>(s.owner.token, `feedlot/report?from=${day(t0 - DAY)}&to=${day(Date.now())}`);
    expect(r.status).toBe(200);
    const c = r.body.corrals.find((x: any) => x.plotId === corral);
    // ganancia 30 kg x 50 cabezas = 1500 kg; MS entre pesadas = 1000 kg; la tercera entrega es posterior
    expect(c).toMatchObject({ status: "ok", feedKgDm: 1500, feeds: 3, head: 50, gainKg: 1500, windowKgDm: 1000, conversion: 0.67, dailyGainKg: 1.5 });
    expect(c.feedKgAsFed).toBeGreaterThan(c.feedKgDm);
  });

  it("sin dos pesadas no hay conversión", async () => {
    const s = await setup();
    const corral = s.plotIds[1]!;
    await push(s.owner.token, [feed(s, corral, 200, Date.now() - DAY)]);
    const r = await erpGet<any>(s.owner.token, `feedlot/report?from=${day(Date.now() - 5 * DAY)}&to=${day(Date.now())}`);
    expect(r.body.corrals[0]).toMatchObject({ plotId: corral, status: "no_weighings", conversion: null, feedKgDm: 200 });
  });
});
