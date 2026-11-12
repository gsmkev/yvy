/** G-31: suplementación y sal mineral por potrero. */
import { describe, expect, it } from "vitest";
import { summarizeSupplements } from "@yvy/shared";
import { addMemberAndLogin, call, createOrgWithOwner } from "./helpers";
import { DAY, setupHerd } from "./herd-helpers";
import { push, rec } from "./records-helpers";

describe("summarizeSupplements (puro)", () => {
  const plots = [
    { plotId: "a", name: "A", head: 100 },
    { plotId: "b", name: "B", head: 0 },
  ];
  it("suma por potrero y tipo, y calcula g/cabeza/día de sal mineral", () => {
    const now = 100 * DAY;
    const r = summarizeSupplements(
      plots,
      [
        { plotId: "a", capturedAt: now - 5 * DAY, type: "sal_mineral", kg: 100 },
        { plotId: "a", capturedAt: now - 2 * DAY, type: "sal_mineral", kg: 50 },
        { plotId: "a", capturedAt: now - 1 * DAY, type: "balanceado", kg: 200 },
        { plotId: "a", capturedAt: now - 40 * DAY, type: "sal_mineral", kg: 999 }, // fuera de la ventana
        { plotId: "b", capturedAt: now - 1 * DAY, type: "sal_mineral", kg: 10 },
      ],
      now - 30 * DAY,
      now,
    );
    expect(r.days).toBe(30);
    const a = r.plots[0]!;
    expect(a).toMatchObject({ totalKg: 350, lastAt: now - DAY, saltGPerHeadDay: 50, saltStatus: "low" });
    expect(a.byType).toEqual({ sal_mineral: 150, balanceado: 200 });
    // sin cabezas no hay consumo por cabeza
    expect(r.plots[1]).toMatchObject({ totalKg: 10, gPerHeadDay: null, saltStatus: null });
    expect(r.totals).toEqual({ kg: 360, byType: { sal_mineral: 160, balanceado: 200 } });
  });
  it("potreros sin registros salen con ceros", () => {
    expect(summarizeSupplements(plots, [], 0, 30 * DAY).plots[0]).toMatchObject({ totalKg: 0, lastAt: null, saltStatus: null });
  });
});

describe("registro supplement", () => {
  it("valida tipo y kilos; el empleado solo en sus potreros", async () => {
    const { owner, worker, farmId, plotIds } = await setupHerd();
    const r = await push(owner.token, [
      rec(farmId, plotIds[0]!, "supplement", { type: "sal_mineral", kg: 40 }),
      rec(farmId, null, "supplement", { type: "sal_mineral", kg: 40 }),
      rec(farmId, plotIds[0]!, "supplement", { type: "sal_mineral", kg: 0 }),
      rec(farmId, plotIds[0]!, "supplement", { type: "azucar", kg: 5 }),
      rec(farmId, plotIds[0]!, "supplement", { type: "otro", kg: 1_000_000 }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", ...Array(4).fill("rejected")]);
    const w = await push(worker.token, [
      rec(farmId, plotIds[1]!, "supplement", { type: "heno", kg: 10 }),
      rec(farmId, plotIds[3]!, "supplement", { type: "heno", kg: 10 }),
    ]);
    expect(w.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
  });
});

describe("GET /org/farms/:id/supplements", () => {
  it("totales por potrero con la hacienda actual y consumo de sal por cabeza", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "herd_count", { counts: { vaca: 50 } }, now - 20 * DAY),
      rec(farmId, plotIds[0]!, "supplement", { type: "sal_mineral", kg: 90 }, now - 10 * DAY),
      rec(farmId, plotIds[0]!, "supplement", { type: "sal_mineral", kg: 60 }, now - 3 * DAY),
      rec(farmId, plotIds[1]!, "supplement", { type: "balanceado", kg: 300 }, now - 3 * DAY),
      rec(farmId, plotIds[1]!, "supplement", { type: "balanceado", kg: 300 }, now - 60 * DAY), // fuera del mes
    ]);
    const res = await call<any>("GET", `/org/farms/${farmId}/supplements`, { token: owner.token });
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
    const a = res.body.plots.find((p: any) => p.plotId === plotIds[0]);
    // 150 kg / (50 cabezas x 30 días) = 100 g por cabeza y día
    expect(a).toMatchObject({ head: 50, totalKg: 150, saltGPerHeadDay: 100, saltStatus: "ok" });
    expect(res.body.plots.find((p: any) => p.plotId === plotIds[1])).toMatchObject({ totalKg: 300, saltGPerHeadDay: null });
    expect(res.body.totals.kg).toBe(450);
    const long = await call<any>("GET", `/org/farms/${farmId}/supplements?from=0`, { token: owner.token });
    expect(long.body.totals.kg).toBe(750);
  });

  it("permisos: no es para el empleado; no mezcla organizaciones", async () => {
    const { owner, worker, farmId } = await setupHerd();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", `/org/farms/${farmId}/supplements`, { token: worker.token })).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/supplements`, { token: agro.token })).status).toBe(200);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/supplements`, { token: other.token })).status).toBe(404);
  });
});
