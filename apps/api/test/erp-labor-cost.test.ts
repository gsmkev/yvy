/** E-23: costo de la labor propia (combustible + operario + amortización) frente al contratista. */
import { describe, expect, it } from "vitest";
import { contractorRatePer, laborVerdict, ownLaborCost } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, stockSetup } from "./erp-helpers";
import { push, rec } from "./records-helpers";

const profile = (extra: Record<string, unknown> = {}) => ({
  service: "spraying",
  purchasePricePyg: 300_000_000,
  residualPyg: 100_000_000,
  lifeHours: 10_000,
  operatorPerHourPyg: 15_000,
  haPerHour: 5,
  ...extra,
});
const put = (token: string, machineId: string, body: unknown) => call("PUT", `/org/erp/machine-costs/${machineId}`, { token, body });

async function setup() {
  const s = await stockSetup();
  const fuel = await call<any>("POST", "/org/products", { token: s.owner.token, body: { name: "Gasoil", type: "fuel", unit: "l" } });
  await erpPost(s.owner.token, "stock/purchases", { productId: fuel.body.id, warehouseId: s.whA, date: "2026-11-05", qty: 1000, amount: 8_000_000, currency: "PYG" });
  const m = await erpPost(s.owner.token, "machines", { name: "Pulverizadora", type: "sprayer", meterKind: "hours", meterValue: 1000 });
  return { ...s, machineId: m.body.id as string };
}

describe("labor propia vs contratista (E-23)", () => {
  it("funciones puras: costo por hora, por hectárea y veredicto", () => {
    const own = ownLaborCost({ fuelLitersPerHour: 10, fuelPricePyg: 8000, operatorPerHourPyg: 15_000, purchasePricePyg: 300_000_000, residualPyg: 100_000_000, lifeHours: 10_000, haPerHour: 5 });
    expect(own).toEqual({ fuelPerHour: 80_000, operatorPerHour: 15_000, depreciationPerHour: 20_000, totalPerHour: 115_000, perHa: 23_000 });
    expect(contractorRatePer("ha", 30_000, 5)).toEqual({ perHa: 30_000, perHour: 150_000 });
    expect(contractorRatePer("hour", 100_000, 5)).toEqual({ perHa: 20_000, perHour: 100_000 });
    expect(contractorRatePer("ton", 100_000, 5)).toEqual({ perHa: null, perHour: null });
    expect(laborVerdict(own, 30_000, 150_000)).toEqual({ basis: "ha", savingPyg: 7000, cheaper: "own" });
    expect(laborVerdict({ ...own, perHa: null }, null, 100_000)).toEqual({ basis: "hour", savingPyg: -15_000, cheaper: "contractor" });
    expect(laborVerdict({ ...own, perHa: null }, null, null)).toBeNull();
    expect(ownLaborCost({ fuelLitersPerHour: null, fuelPricePyg: null, operatorPerHourPyg: 0, purchasePricePyg: 10, residualPyg: 50, lifeHours: 0, haPerHour: null }).totalPerHour).toBe(0);
  });

  it("compara con el contratista más barato del mismo servicio, con el litro al costo del stock y el consumo de las cargas", async () => {
    const s = await setup();
    expect((await put(s.owner.token, s.machineId, profile())).status).toBe(200);
    await erpPost(s.owner.token, "contractors", { name: "Pulveriza SA", service: "spraying", rateUnit: "ha", rateAmount: 30_000, currency: "PYG" });
    await erpPost(s.owner.token, "contractors", { name: "Otro", service: "spraying", rateUnit: "ha", rateAmount: 35_000, currency: "PYG" });
    await erpPost(s.owner.token, "contractors", { name: "Cosechero", service: "harvest", rateUnit: "ha", rateAmount: 1000, currency: "PYG" });
    // 0,8 l/h entre lecturas (tanque a tanque) -> 6400 por hora de combustible
    const now = Date.now();
    const load = (liters: number, meter: number, at: number) => rec(s.farmId, null, "fuel_load", { machineId: s.machineId, machine: "Pulverizadora", liters, meterValue: meter }, at);
    await push(s.owner.token, [load(100, 1000, now - 3000), load(80, 1100, now - 2000)]);
    const r = (await erpGet<any[]>(s.owner.token, "labor-cost")).body;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ machine: "Pulverizadora", fuelLitersPerHour: 0.8, fuelPricePyg: 8000 });
    expect(r[0].own).toMatchObject({ fuelPerHour: 6400, depreciationPerHour: 20_000, totalPerHour: 41_400, perHa: 8280 });
    expect(r[0].contractor).toMatchObject({ name: "Pulveriza SA", perHa: 30_000 });
    expect(r[0].verdict).toEqual({ basis: "ha", savingPyg: 21_720, cheaper: "own" });
  });

  it("los datos cargados a mano ganan; guardar de nuevo reemplaza y borrar saca la máquina de la comparación", async () => {
    const s = await setup();
    await put(s.owner.token, s.machineId, profile({ fuelLitersPerHour: 10, fuelPricePyg: 9000, haPerHour: null }));
    await put(s.owner.token, s.machineId, profile({ fuelLitersPerHour: 10, fuelPricePyg: 9000, haPerHour: null, operatorPerHourPyg: 20_000 }));
    await erpPost(s.owner.token, "contractors", { name: "Por hora", service: "spraying", rateUnit: "hour", rateAmount: 100_000, currency: "PYG" });
    const r = (await erpGet<any[]>(s.owner.token, "labor-cost")).body;
    expect(r).toHaveLength(1);
    expect(r[0].own).toMatchObject({ fuelPerHour: 90_000, operatorPerHour: 20_000, totalPerHour: 130_000, perHa: null });
    expect(r[0].verdict).toEqual({ basis: "hour", savingPyg: -30_000, cheaper: "contractor" });
    expect((await erpGet<any[]>(s.owner.token, "machine-costs")).body).toHaveLength(1);
    expect((await call("DELETE", `/org/erp/machine-costs/${s.machineId}`, { token: s.owner.token })).status).toBe(200);
    expect((await erpGet<any[]>(s.owner.token, "labor-cost")).body).toEqual([]);
  });

  it("un contratista en dólares se convierte con el tipo de cambio; sin tipo de cambio no se compara", async () => {
    const s = await setup();
    await put(s.owner.token, s.machineId, profile());
    await erpPost(s.owner.token, "contractors", { name: "En dólares", service: "spraying", rateUnit: "ha", rateAmount: 500, currency: "USD" });
    expect((await erpGet<any[]>(s.owner.token, "labor-cost")).body[0].contractor).toBeNull();
    await call("PUT", "/org/erp/exchange-rates/2026-11-01", { token: s.owner.token, body: { usdToPyg: 7000 } });
    expect((await erpGet<any[]>(s.owner.token, "labor-cost")).body[0].contractor).toMatchObject({ perHa: 35_000 });
  });

  it("valida y aísla por organización", async () => {
    const s = await setup();
    const other = await setup();
    expect((await put(s.owner.token, other.machineId, profile())).status).toBe(404);
    expect((await put(s.owner.token, s.machineId, profile({ service: "otro" }))).status).toBe(400);
    expect((await put(s.owner.token, s.machineId, profile({ lifeHours: -1 }))).status).toBe(400);
    expect((await put(s.owner.token, "no-uuid", profile())).status).toBe(400);
  });

  it("permisos: son montos, solo dueño y administrador (el agrónomo y el empleado, no)", async () => {
    const s = await setup();
    expect((await put(s.admin.token, s.machineId, profile())).status).toBe(200);
    for (const who of [s.agro, s.worker]) {
      expect((await put(who.token, s.machineId, profile())).status).toBe(403);
      expect((await erpGet(who.token, "machine-costs")).status).toBe(403);
      expect((await erpGet(who.token, "labor-cost")).status).toBe(403);
      expect((await call("DELETE", `/org/erp/machine-costs/${s.machineId}`, { token: who.token })).status).toBe(403);
    }
  });
});
