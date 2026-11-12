/** E-32: presupuesto de campaña por lote, cultivo y actividad frente a lo real (cost_entries). */
import { describe, expect, it } from "vitest";
import { budgetVsActual } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

async function setup() {
  const s = await erpSetup(3);
  const season = await call<any>("POST", "/org/seasons", { token: s.owner.token, body: { name: "Zafra 2026/27", startsOn: "2026-09-01", endsOn: "2027-04-30" } });
  return { ...s, seasonId: season.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;
const cost = (s: S, extra: Record<string, unknown>) =>
  erpPost(s.owner.token, "costs", { date: "2026-11-05", activity: "agricultura", category: "input", amount: 1_000_000, currency: "PYG", seasonId: s.seasonId, ...extra });
const line = (s: S, extra: Record<string, unknown>) => erpPost(s.owner.token, "budget-lines", { seasonId: s.seasonId, category: "input", amountPyg: 5_000_000, ...extra });
const compare = async (s: S, token = s.owner.token) => (await erpGet<any>(token, `budget/compare?seasonId=${s.seasonId}`)).body;

describe("presupuesto de campaña (E-32)", () => {
  it("budgetVsActual: por lote, por cultivo y de toda la campaña, con actividad y rubro", () => {
    const rows = budgetVsActual(
      [
        { id: "1", plotId: "p1", crop: null, activity: null, category: "input", amountPyg: 1000 },
        { id: "2", plotId: null, crop: "soja", activity: null, category: "input", amountPyg: 2000 },
        { id: "3", plotId: null, crop: null, activity: "ganaderia", category: "other", amountPyg: 500 },
        { id: "4", plotId: null, crop: null, activity: null, category: "sale", amountPyg: 0 },
      ],
      [
        { plotId: "p1", activity: "agricultura", category: "input", amountPyg: 700 },
        { plotId: "p2", activity: "agricultura", category: "input", amountPyg: 900 },
        { plotId: "p3", activity: "agricultura", category: "input", amountPyg: 300 },
        { plotId: null, activity: "ganaderia", category: "other", amountPyg: 250 },
        { plotId: null, activity: "agricultura", category: "other", amountPyg: 999 },
      ],
      new Map([["p1", "soja"], ["p2", "soja"], ["p3", "maiz"]]),
    );
    expect(rows.map((r) => [r.actualPyg, r.diffPyg, r.pct])).toEqual([[700, -300, 70], [1600, -400, 80], [250, -250, 50], [0, 0, null]]);
  });

  it("compara lo presupuestado con los costos reales de la campaña (lote, cultivo y toda la campaña)", async () => {
    const s = await setup();
    for (const [i, crop] of [[0, "soja"], [1, "maiz"]] as const)
      expect((await call("PUT", `/org/seasons/${s.seasonId}/plots/${s.plotIds[i]}`, { token: s.owner.token, body: { crop } })).status).toBe(200);
    await line(s, { plotId: s.plotIds[0], amountPyg: 4_000_000 });
    await line(s, { crop: "soja", amountPyg: 10_000_000 });
    await line(s, { category: "fuel", amountPyg: 2_000_000 });
    await cost(s, { plotId: s.plotIds[0], amount: 3_000_000 });
    await cost(s, { plotId: s.plotIds[1], amount: 1_000_000 }); // otro lote, sin cultivo de soja
    await cost(s, { plotId: s.plotIds[0], category: "fuel", amount: 2_500_000 });
    await cost(s, { plotId: s.plotIds[0], amount: 999, seasonId: null }); // de otra campaña: no cuenta
    const r = await compare(s);
    const by = (f: (x: any) => boolean) => r.rows.find(f);
    expect(by((x) => x.plotId === s.plotIds[0])).toMatchObject({ amountPyg: 4_000_000, actualPyg: 3_000_000, diffPyg: -1_000_000, pct: 75 });
    expect(by((x) => x.crop === "soja")).toMatchObject({ actualPyg: 3_000_000, pct: 30 });
    expect(by((x) => x.category === "fuel")).toMatchObject({ actualPyg: 2_500_000, diffPyg: 500_000, pct: 125 });
    expect(r.totals).toEqual({ costPlannedPyg: 16_000_000, costActualPyg: 8_500_000, incomePlannedPyg: 0, incomeActualPyg: 0 });
  });

  it("una línea de ventas compara ingresos y la actividad filtra", async () => {
    const s = await setup();
    await line(s, { category: "sale", amountPyg: 20_000_000 });
    await line(s, { category: "other", activity: "ganaderia", amountPyg: 1_000_000 });
    await cost(s, { category: "sale", amount: 8_000_000 });
    await cost(s, { category: "other", activity: "ganaderia", amount: 400_000 });
    await cost(s, { category: "other", activity: "agricultura", amount: 700_000 });
    const r = await compare(s);
    expect(r.rows.find((x: any) => x.category === "sale")).toMatchObject({ actualPyg: 8_000_000, pct: 40 });
    expect(r.rows.find((x: any) => x.activity === "ganaderia")).toMatchObject({ actualPyg: 400_000 });
    expect(r.totals).toMatchObject({ incomePlannedPyg: 20_000_000, incomeActualPyg: 8_000_000, costPlannedPyg: 1_000_000, costActualPyg: 400_000 });
  });

  it("un lote o un cultivo, no los dos: queda el que se mandó; cambiar el alcance limpia el otro", async () => {
    const s = await setup();
    const a = await line(s, { plotId: s.plotIds[0], crop: "soja" });
    expect(a.status).toBe(201);
    let rows = (await erpGet<any[]>(s.owner.token, "budget-lines")).body;
    expect(rows[0]).toMatchObject({ plotId: s.plotIds[0], crop: null });
    await call("PATCH", `/org/erp/budget-lines/${a.body.id}`, { token: s.owner.token, body: { crop: "maiz" } });
    rows = (await erpGet<any[]>(s.owner.token, "budget-lines")).body;
    expect(rows[0]).toMatchObject({ plotId: null, crop: "maiz" });
    expect((await call("DELETE", `/org/erp/budget-lines/${a.body.id}`, { token: s.owner.token })).status).toBe(200);
    expect((await compare(s)).rows).toEqual([]);
  });

  it("valida campaña y lote de la organización, monto y rubro", async () => {
    const s = await setup();
    const other = await setup();
    expect((await line(s, { seasonId: other.seasonId })).status).toBe(404);
    expect((await line(s, { plotId: other.plotIds[0] })).status).toBe(404);
    expect((await line(s, { amountPyg: 0 })).status).toBe(400);
    expect((await line(s, { category: "magia" })).status).toBe(400);
    expect((await erpGet(s.owner.token, `budget/compare?seasonId=${other.seasonId}`)).status).toBe(404);
    expect((await erpGet(s.owner.token, "budget/compare")).status).toBe(400);
  });

  it("permisos: son montos, solo dueño y administrador (el agrónomo y el empleado, no)", async () => {
    const s = await setup();
    expect((await erpPost(s.admin.token, "budget-lines", { seasonId: s.seasonId, category: "input", amountPyg: 1000 })).status).toBe(201);
    for (const who of [s.agro, s.worker]) {
      expect((await erpPost(who.token, "budget-lines", { seasonId: s.seasonId, category: "input", amountPyg: 1000 })).status).toBe(403);
      expect((await erpGet(who.token, "budget-lines")).status).toBe(403);
      expect((await erpGet(who.token, `budget/compare?seasonId=${s.seasonId}`)).status).toBe(403);
    }
  });
});
