/** ERP y roles nuevos (T-09 supervisor, K-03 contratista): sin acceso salvo lo que el código del ERP permite. */
import { describe, expect, it } from "vitest";
import { addMemberAndLogin } from "./helpers";
import { erpGet, erpPost, erpSetup, expectListStatus } from "./erp-helpers";

describe("ERP · supervisor y contratista", () => {
  it("el dueño y el administrador ven montos; el agrónomo solo cantidades de stock; supervisor, contratista y empleado nada", async () => {
    const s = await erpSetup();
    const supervisor = await addMemberAndLogin(s.owner.token, "supervisor", "Capataz");
    const contractor = await addMemberAndLogin(s.owner.token, "contractor", "Contratista");
    const who = (owner: number, admin: number, agro: number, sup: number, con: number, worker = 403): Record<string, [string, number]> => ({
      owner: [s.owner.token, owner],
      admin: [s.admin.token, admin],
      agronomist: [s.agro.token, agro],
      supervisor: [supervisor.token, sup],
      contractor: [contractor.token, con],
      worker: [s.worker.token, worker],
    });
    // montos: solo dueño y administrador
    for (const path of ["costs", "grain-contracts/summary", "grain-deliveries", "parties", "contractors"]) {
      await expectListStatus(path, who(200, 200, 403, 403, 403));
    }
    // cantidades de stock: también el agrónomo, nunca el supervisor ni los roles de campo
    await expectListStatus("stock", who(200, 200, 200, 403, 403));
  });

  it("supervisor y contratista no crean nada en el ERP", async () => {
    const s = await erpSetup();
    const supervisor = await addMemberAndLogin(s.owner.token, "supervisor", "Capataz");
    const contractor = await addMemberAndLogin(s.owner.token, "contractor", "Contratista");
    for (const token of [supervisor.token, contractor.token]) {
      expect((await erpPost(token, "parties", { name: "Proveedor", kind: "supplier" })).status).toBe(403);
      expect((await erpPost(token, "grain-contracts", { crop: "soja", tons: 10, priceMinor: 100, currency: "PYG" })).status).toBe(403);
      expect((await erpPost(token, "warehouses", { farmId: s.farmId, name: "Galpón", type: "shed" })).status).toBe(403);
    }
    // el dueño sí
    expect((await erpPost(s.owner.token, "parties", { name: "Proveedor", kind: "supplier" })).status).toBe(201);
    expect((await erpGet(s.owner.token, "parties")).body).toHaveLength(1);
  });
});
