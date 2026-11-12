/** E-04: contratistas con tarifas. Las tarifas son montos: el agrónomo y el empleado no las ven. */
import { describe, expect, it } from "vitest";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup, expectListStatus } from "./erp-helpers";

const rate = { name: "Pulverizaciones Villalba", service: "spraying", rateUnit: "ha", rateAmount: 35000, currency: "PYG" };

describe("contratistas (E-04)", () => {
  it("guarda la tarifa en unidad menor, por hectárea, hora o tonelada", async () => {
    const { owner } = await erpSetup();
    expect((await erpPost(owner.token, "contractors", rate)).status).toBe(201);
    expect((await erpPost(owner.token, "contractors", { name: "Cosechas SA", service: "harvest", rateUnit: "ton", rateAmount: 1250, currency: "USD" })).status).toBe(201);
    expect((await erpPost(owner.token, "contractors", { name: "Fletes", service: "freight", rateUnit: "hour", rateAmount: 90000, currency: "PYG" })).status).toBe(201);
    const list = await erpGet<any[]>(owner.token, "contractors");
    expect(list.body.map((c) => [c.rateUnit, c.rateAmount, c.currency])).toEqual([
      ["ton", 1250, "USD"],
      ["hour", 90000, "PYG"],
      ["ha", 35000, "PYG"],
    ]);
  });

  it("valida servicio, unidad, moneda, monto entero y proveedor de la organización", async () => {
    const { owner } = await erpSetup();
    for (const bad of [{ service: "x" }, { rateUnit: "km" }, { currency: "EUR" }, { rateAmount: 10.5 }, { rateAmount: -1 }]) {
      expect((await erpPost(owner.token, "contractors", { ...rate, ...bad })).status).toBe(400);
    }
    expect((await erpPost(owner.token, "contractors", { ...rate, partyId: "11111111-1111-4111-8111-111111111111" })).status).toBe(404);
    const p = await erpPost(owner.token, "parties", { name: "Villalba", kind: "supplier" });
    expect((await erpPost(owner.token, "contractors", { ...rate, partyId: p.body.id })).status).toBe(201);
  });

  it("el administrador edita; el agrónomo y el empleado no ven montos", async () => {
    const { owner, admin, agro, worker } = await erpSetup();
    const a = await erpPost(admin.token, "contractors", rate);
    expect(a.status).toBe(201);
    expect((await call("PATCH", `/org/erp/contractors/${a.body.id}`, { token: admin.token, body: { rateAmount: 40000 } })).status).toBe(200);
    expect((await erpGet<any[]>(owner.token, "contractors")).body[0].rateAmount).toBe(40000);
    expect((await erpPost(agro.token, "contractors", rate)).status).toBe(403);
    expect((await call("DELETE", `/org/erp/contractors/${a.body.id}`, { token: agro.token })).status).toBe(403);
    await expectListStatus("contractors", { agro: [agro.token, 403], worker: [worker.token, 403] });
  });
});
