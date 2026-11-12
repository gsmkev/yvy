/** R-07: comparación entre estancias y entre campañas. */
import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";
import { push, rec } from "./records-helpers";

describe("R-07 · comparar", () => {
  it("compara estancias: superficie, lotes y registros de 30 días, y respeta el alcance", async () => {
    const owner = await createOrgWithOwner();
    const a = await createFarmWithPlots(owner.token, 3);
    const b = await createFarmWithPlots(owner.token, 1);
    await push(owner.token, [rec(a.farmId, null, "rain", { mm: 5, readAt: Date.now() }), rec(a.farmId, null, "rain", { mm: 2, readAt: Date.now() })]);
    const res = await call<{ id: string; plots: number; records30d: number; rain30Mm: number | null }[]>("GET", "/org/compare/farms", { token: owner.token });
    expect(res.status).toBe(200);
    const byId = new Map(res.body.map((r) => [r.id, r]));
    expect(byId.get(a.farmId)).toMatchObject({ plots: 3, records30d: 2, rain30Mm: null });
    expect(byId.get(b.farmId)).toMatchObject({ plots: 1, records30d: 0 });

    const sup = await addMemberAndLogin(owner.token, "supervisor", "Capataz");
    await call("PUT", `/org/members/${sup.userId}/farms`, { token: owner.token, body: { farms: [{ farmId: b.farmId }] } });
    const mine = await call<{ id: string }[]>("GET", "/org/compare/farms", { token: sup.token });
    expect(mine.body.map((r) => r.id)).toEqual([b.farmId]);
  });

  it("compara campañas: superficie, toneladas y rinde por hectárea", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const mkSeason = async (name: string) =>
      (await call<{ id: string }>("POST", "/org/seasons", { token: owner.token, body: { name, startDate: null, endDate: null, active: true } })).body.id;
    const s1 = await mkSeason("Zafra 24/25");
    const s2 = await mkSeason("Zafra 25/26");
    for (const sid of [s1, s2])
      await call("PUT", `/org/seasons/${sid}/plots/${plotIds[0]}`, { token: owner.token, body: { crop: "soja", variety: null, plannedSowingDate: null, targetYieldTHa: 3.5 } });
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "harvest", { seasonId: s1, tons: 300, areaHa: 100 }),
      rec(farmId, plotIds[0]!, "harvest", { seasonId: s2, tons: 400, areaHa: 100 }),
    ]);
    const res = await call<{ id: string; yieldTHa: number | null; harvestTons: number; targetYieldTHa: number | null; plots: number }[]>("GET", "/org/compare/seasons", { token: owner.token });
    expect(res.status).toBe(200);
    const by = new Map(res.body.map((r) => [r.id, r]));
    expect(by.get(s1)).toMatchObject({ yieldTHa: 3, harvestTons: 300, targetYieldTHa: 3.5, plots: 1 });
    expect(by.get(s2)).toMatchObject({ yieldTHa: 4, harvestTons: 400 });
  });

  it("el empleado no compara", async () => {
    const owner = await createOrgWithOwner();
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", "/org/compare/farms", { token: worker.token })).status).toBe(403);
    expect((await call("GET", "/org/compare/seasons", { token: worker.token })).status).toBe(403);
  });
});
