import { describe, expect, it } from "vitest";
import { DAY } from "./agri2-helpers";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";
import { push, rec } from "./records-helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
  const prod = await call<{ id: string }>("POST", "/org/products", {
    token: owner.token,
    body: { name: "Fungicida X", type: "agrochemical", unit: "l", withdrawalDays: 21 },
  });
  return { owner, farmId, plotIds, productId: prod.body.id };
}

const application = (productId: string | undefined, name = "Fungicida X") => ({
  products: [{ productId, name, dose: 0.5, unit: "l_ha" }],
});

describe("A-14 · carencia antes de cosechar", () => {
  it("avisa hasta cuándo no cosechar y detecta la cosecha hecha antes de tiempo", async () => {
    const { owner, farmId, plotIds, productId } = await setup();
    const t0 = Date.now();
    const res = await push(owner.token, [
      rec(farmId, plotIds[0]!, "application", application(productId), t0 - 5 * DAY),
      rec(farmId, plotIds[1]!, "application", application(productId), t0 - 30 * DAY), // ya cumplida
      rec(farmId, plotIds[0]!, "harvest", { tons: 20 }, t0 - 1 * DAY), // cosechó a los 4 días de aplicar
    ]);
    expect(res.status).toBe(200);
    const r = await call("GET", `/org/farms/${farmId}/withdrawal`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.restrictions).toHaveLength(1);
    expect(r.body.restrictions[0]).toMatchObject({ plotId: plotIds[0], plotName: "Lote 1", product: "Fungicida X" });
    expect(r.body.restrictions[0].daysLeft).toBeGreaterThanOrEqual(15);
    expect(r.body.restrictions[0].daysLeft).toBeLessThanOrEqual(17);
    expect(r.body.violations).toHaveLength(1);
    expect(r.body.violations[0]).toMatchObject({ plotId: plotIds[0], product: "Fungicida X" });
    expect(r.body.unknown).toEqual([]);
  });

  it("los productos escritos a mano o sin carencia se listan como no controlados", async () => {
    const { owner, farmId, plotIds } = await setup();
    await push(owner.token, [rec(farmId, plotIds[0]!, "application", application(undefined, "Caldo casero"), Date.now() - DAY)]);
    const r = await call("GET", `/org/farms/${farmId}/withdrawal`, { token: owner.token });
    expect(r.body.restrictions).toEqual([]);
    expect(r.body.unknown).toEqual([expect.objectContaining({ plotId: plotIds[0], product: "Caldo casero" })]);
  });

  it("el empleado solo ve sus lotes; otra organización no ve nada", async () => {
    const { owner, farmId, plotIds, productId } = await setup();
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "application", application(productId), Date.now() - DAY),
      rec(farmId, plotIds[1]!, "application", application(productId), Date.now() - DAY),
    ]);
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/farms/${farmId}/withdrawal`, { token: worker.token })).status).toBe(404);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    const w = await call("GET", `/org/farms/${farmId}/withdrawal`, { token: worker.token });
    expect(w.status).toBe(200);
    expect(w.body.restrictions.map((x: any) => x.plotId)).toEqual([plotIds[0]]);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/withdrawal`, { token: other.token })).status).toBe(404);
  });
});
