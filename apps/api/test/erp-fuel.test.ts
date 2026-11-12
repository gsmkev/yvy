/** E-16: carga de combustible (fuel_load): descuenta stock, carga costo, actualiza el horómetro y informa litros por hora. */
import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, stockSetup } from "./erp-helpers";
import { fuelRate } from "../src/db/fuel";
import { push, rec } from "./records-helpers";

async function setup() {
  const s = await stockSetup();
  const fuel = await call<any>("POST", "/org/products", { token: s.owner.token, body: { name: "Gasoil", type: "fuel", unit: "l" } });
  await erpPost(s.owner.token, "stock/purchases", { productId: fuel.body.id, warehouseId: s.whA, date: "2026-11-05", qty: 1000, amount: 8_000_000, currency: "PYG" });
  const tractor = await erpPost(s.owner.token, "machines", { name: "John Deere", type: "tractor", meterKind: "hours", meterValue: 900 });
  return { ...s, fuelId: fuel.body.id as string, machineId: tractor.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;

const load = (s: S, liters: number, meterValue?: number, at = Date.now() - 1000, extra: Record<string, unknown> = {}) =>
  rec(s.farmId, null, "fuel_load", { machineId: s.machineId, machine: "John Deere", liters, ...(meterValue === undefined ? {} : { meterValue }), ...extra }, at);
const fuelStock = async (s: S) => (await erpGet<any>(s.owner.token, "stock")).body.products.find((p: any) => p.productId === s.fuelId);

describe("combustible (E-16)", () => {
  it("la carga descuenta el único combustible del catálogo y carga un costo de combustible", async () => {
    const s = await setup();
    const m = load(s, 100, 1000);
    expect((await push(s.owner.token, [m])).body.results[0].status).toBe("applied");
    expect(await fuelStock(s)).toMatchObject({ qty: 900, valuePyg: 7_200_000, avgCostPyg: 8000 });
    const c = (await erpGet<any>(s.owner.token, "costs")).body.rows;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ category: "fuel", amountPyg: 800_000, description: "John Deere", origin: "consumption", originId: m.row.id, farmId: s.farmId });
  });

  it("deja en la máquina la lectura más alta del horómetro (y sincroniza el cambio)", async () => {
    const s = await setup();
    await push(s.owner.token, [load(s, 50, 1250)]);
    await push(s.owner.token, [load(s, 50, 1000)]); // una lectura vieja no la baja
    const machines = (await erpGet<any[]>(s.owner.token, "machines")).body;
    expect(machines[0].meterValue).toBe(1250);
    const pulled = await call<any>("POST", "/sync/pull", { token: s.worker.token, body: { table: "machines", cursor: null } });
    expect(pulled.body.rows[0].meterValue).toBe(1250);
  });

  it("si hay más de un combustible no se adivina: hace falta el producto", async () => {
    const s = await setup();
    const nafta = await call<any>("POST", "/org/products", { token: s.owner.token, body: { name: "Nafta", type: "fuel", unit: "l" } });
    await push(s.owner.token, [load(s, 100)]);
    expect(await fuelStock(s)).toMatchObject({ qty: 1000 });
    await push(s.owner.token, [load(s, 100, undefined, Date.now() - 500, { productId: s.fuelId })]);
    expect(await fuelStock(s)).toMatchObject({ qty: 900 });
    expect(nafta.status).toBe(201);
  });

  it("editar y borrar la carga revierten el stock y el costo", async () => {
    const s = await setup();
    const m = load(s, 100, 1000);
    await push(s.owner.token, [m]);
    await push(s.owner.token, [{ ...m, mutationId: newId(), row: { ...m.row, data: { ...(m.row.data as object), liters: 40 } } }]);
    expect(await fuelStock(s)).toMatchObject({ qty: 960 });
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows[0].amountPyg).toBe(320_000);
    await push(s.owner.token, [{ mutationId: newId(), kind: "records.delete", row: { id: m.row.id } }]);
    expect(await fuelStock(s)).toMatchObject({ qty: 1000 });
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toHaveLength(0);
  });

  it("un empleado carga combustible desde el celular", async () => {
    const s = await setup();
    expect((await push(s.worker.token, [load(s, 30, 1010)])).body.results[0].status).toBe("applied");
    expect(await fuelStock(s)).toMatchObject({ qty: 970 });
  });

  it("valida el registro: litros positivos y máquina con nombre", async () => {
    const s = await setup();
    const bad = (data: object) => push(s.owner.token, [rec(s.farmId, null, "fuel_load", data)]);
    expect((await bad({ machine: "JD", liters: 0 })).body.results[0].status).toBe("rejected");
    expect((await bad({ liters: 10 })).body.results[0].status).toBe("rejected");
    expect((await bad({ machine: "JD", liters: 10, meterValue: -1 })).body.results[0].status).toBe("rejected");
  });

  it("informe: litros por hora entre lecturas (tanque a tanque), por máquina y por nombre escrito a mano", async () => {
    const s = await setup();
    const day = 86_400_000;
    const now = Date.now();
    await push(s.owner.token, [
      load(s, 100, 1000, now - 3 * day),
      load(s, 80, 1100, now - 2 * day),
      load(s, 120, 1250, now - day),
      rec(s.farmId, null, "fuel_load", { machine: "Camioneta del peón", liters: 40 }, now - day),
      rec(s.farmId, null, "fuel_load", { machine: "camioneta del peón", liters: 20 }, now - day / 2),
    ]);
    const r = (await erpGet<any[]>(s.owner.token, "fuel/report")).body;
    const jd = r.find((x) => x.machineId === s.machineId);
    expect(jd).toMatchObject({ name: "John Deere", loads: 3, liters: 300, firstMeter: 1000, lastMeter: 1250, litersPerUnit: 0.8, meterKind: "hours" });
    const pick = r.find((x) => x.machineId === null);
    expect(pick).toMatchObject({ loads: 2, liters: 60, litersPerUnit: null });
    // período
    const recent = (await erpGet<any[]>(s.owner.token, `fuel/report?from=${new Date(now - day - 3600_000).toISOString().slice(0, 10)}`)).body;
    expect(recent.find((x) => x.machineId === s.machineId)).toMatchObject({ loads: 1, litersPerUnit: null });
  });

  it("informe: el agrónomo lo ve (son litros, no montos); el empleado no", async () => {
    const s = await setup();
    await push(s.owner.token, [load(s, 100, 1000)]);
    expect((await erpGet<any[]>(s.agro.token, "fuel/report")).body).toHaveLength(1);
    expect((await erpGet(s.worker.token, "fuel/report")).status).toBe(403);
  });
});

describe("litros por hora (fuelRate)", () => {
  const l = (liters: number, meter: number | null, at = 0) => ({ liters, meter, at });
  it("tanque a tanque: la primera carga con lectura no cuenta", () => {
    expect(fuelRate([l(100, 1000), l(80, 1100), l(120, 1250)], "hours")).toBe(0.8);
  });
  it("vehículos: litros cada 100 km", () => {
    expect(fuelRate([l(50, 10_000), l(30, 10_300)], "km")).toBe(10);
  });
  it("sin dos lecturas distintas no hay cálculo", () => {
    expect(fuelRate([l(100, 1000)], "hours")).toBeNull();
    expect(fuelRate([l(100, 1000), l(50, 1000)], "hours")).toBeNull();
    expect(fuelRate([l(100, null), l(50, null)], "hours")).toBeNull();
  });
});
