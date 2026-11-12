/** E-38: exportación al contador con plan de cuentas configurable. */
import { describe, expect, it } from "vitest";
import { accountFor, DEFAULT_ACCOUNT_MAP } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

const put = (token: string, key: string, body: unknown) => call("PUT", `/org/erp/accountant/map/${key}`, { token, body });
const cost = (token: string, extra: Record<string, unknown>) => erpPost(token, "costs", { date: "2026-11-05", activity: "agricultura", category: "input", amount: 1_000_000, currency: "PYG", ...extra });

describe("exportación al contador (E-38)", () => {
  it("accountFor usa el plan del contador y, si falta, el de ejemplo", () => {
    expect(accountFor("fuel", {})).toEqual(DEFAULT_ACCOUNT_MAP.fuel);
    expect(accountFor("fuel", { fuel: { code: "6.1", name: "Combustible" } })).toEqual({ code: "6.1", name: "Combustible" });
  });

  it("el libro lleva la cuenta de cada rubro, el tercero con RUC y la estancia; el mapeo se cambia y se restablece", async () => {
    const s = await erpSetup();
    const p = await erpPost(s.owner.token, "parties", { name: "Agro SA", ruc: "80012345-6", kind: "supplier" });
    await cost(s.owner.token, { partyId: p.body.id, farmId: s.farmId, description: "Semillas" });
    await cost(s.owner.token, { category: "sale", amount: 9_000_000, activity: "agricultura", description: "Venta de soja" });
    let r = (await erpGet<any>(s.owner.token, "accountant/export")).body;
    expect(r.truncated).toBe(false);
    expect(r.ledger).toHaveLength(2);
    expect(r.ledger.find((x: any) => x.description === "Semillas")).toMatchObject({ type: "cost", accountCode: "5.1.01", accountName: "Insumos", party: "Agro SA", ruc: "80012345-6", date: "2026-11-05", currency: "PYG", amountPyg: 1_000_000 });
    expect(r.ledger.find((x: any) => x.type === "income")).toMatchObject({ accountCode: "4.1.01" });
    expect((await put(s.owner.token, "input", { code: "6.01.001", name: "Semillas y agroquímicos" })).status).toBe(200);
    r = (await erpGet<any>(s.owner.token, "accountant/export")).body;
    expect(r.ledger.find((x: any) => x.description === "Semillas")).toMatchObject({ accountCode: "6.01.001", accountName: "Semillas y agroquímicos" });
    const map = (await erpGet<any[]>(s.owner.token, "accountant/map")).body;
    expect(map.find((m) => m.key === "input")).toMatchObject({ code: "6.01.001", custom: true });
    expect(map.find((m) => m.key === "fuel")).toMatchObject({ code: "5.1.02", custom: false });
    await put(s.owner.token, "input", { code: "6.01.002", name: "Insumos" });
    expect((await erpGet<any[]>(s.owner.token, "accountant/map")).body.find((m) => m.key === "input").code).toBe("6.01.002");
    expect((await call("DELETE", "/org/erp/accountant/map/input", { token: s.owner.token })).status).toBe(200);
    expect((await call("DELETE", "/org/erp/accountant/map/input", { token: s.owner.token })).status).toBe(404);
    expect((await erpGet<any>(s.owner.token, "accountant/export")).body.ledger.find((x: any) => x.description === "Semillas").accountCode).toBe("5.1.01");
  });

  it("filtra por período, no mezcla organizaciones y trae las cuentas a pagar y a cobrar con el RUC", async () => {
    const s = await erpSetup();
    const other = await erpSetup();
    await cost(s.owner.token, { date: "2026-10-01", description: "Octubre" });
    await cost(s.owner.token, { date: "2026-11-05", description: "Noviembre" });
    await cost(other.owner.token, { description: "Ajeno" });
    const r = (await erpGet<any>(s.owner.token, "accountant/export?from=2026-11-01&to=2026-11-30")).body;
    expect(r.ledger.map((x: any) => x.description)).toEqual(["Noviembre"]);
    const party = await erpPost(s.owner.token, "parties", { name: "Proveedor", ruc: "80000001-1", kind: "supplier" });
    const o = await erpPost(s.owner.token, "purchases", { partyId: party.body.id, orderDate: "2026-11-01", currency: "PYG", lines: [{ description: "Flete", qty: 1, unitPrice: 500_000 }] });
    await erpPost(s.owner.token, `purchases/${o.body.id}/invoice`, { invoiceNumber: "F-9", invoiceDate: "2026-11-02", dueDate: "2026-12-02" });
    const r2 = (await erpGet<any>(s.owner.token, "accountant/export")).body;
    expect(r2.payables).toHaveLength(1);
    expect(r2.payables[0]).toMatchObject({ party: "Proveedor", ruc: "80000001-1", pending: 500_000, dueDate: "2026-12-02" });
    expect(r2.receivables).toEqual([]);
  });

  it("valida el rubro, el código y el nombre", async () => {
    const s = await erpSetup();
    expect((await put(s.owner.token, "magia", { code: "1", name: "x" })).status).toBe(400);
    expect((await put(s.owner.token, "input", { code: "", name: "x" })).status).toBe(400);
    expect((await put(s.owner.token, "input", { code: "1" })).status).toBe(400);
    expect((await erpGet(s.owner.token, "accountant/export?from=ayer")).status).toBe(400);
  });

  it("permisos: dueño y administrador; el agrónomo y el empleado no ven ni cambian nada", async () => {
    const s = await erpSetup();
    expect((await put(s.admin.token, "fuel", { code: "5.5", name: "Combustible" })).status).toBe(200);
    expect((await erpGet(s.admin.token, "accountant/export")).status).toBe(200);
    for (const who of [s.agro, s.worker]) {
      expect((await erpGet(who.token, "accountant/export")).status).toBe(403);
      expect((await erpGet(who.token, "accountant/map")).status).toBe(403);
      expect((await put(who.token, "fuel", { code: "1", name: "x" })).status).toBe(403);
      expect((await call("DELETE", "/org/erp/accountant/map/fuel", { token: who.token })).status).toBe(403);
    }
  });
});
