/** E-22: mantenimiento preventivo por horas o kilómetros, con historial y avisos. */
import { describe, expect, it } from "vitest";
import { maintenanceStatus } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

async function setup() {
  const s = await erpSetup();
  const m = await erpPost(s.owner.token, "machines", { name: "Tractor", type: "tractor", meterKind: "hours", meterValue: 400, farmId: s.farmId });
  const plan = await erpPost(s.owner.token, "maintenance-plans", { machineId: m.body.id, name: "Cambio de aceite", everyUnits: 250, lastDoneMeter: 250 });
  return { ...s, machineId: m.body.id as string, planId: plan.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;
const log = (token: string, s: S, extra: Record<string, unknown> = {}) =>
  erpPost(token, "maintenance/logs", { machineId: s.machineId, kind: "preventive", date: "2026-11-05", ...extra });

describe("mantenimiento (E-22)", () => {
  it("maintenanceStatus: ok, por vencer (último 10 %) y vencido", () => {
    const st = (meter: number) => maintenanceStatus({ meter, lastDoneMeter: 0, everyUnits: 250 }).status;
    expect([st(100), st(230), st(250), st(300)]).toEqual(["ok", "soon", "overdue", "overdue"]);
    expect(maintenanceStatus({ meter: 400, lastDoneMeter: 250, everyUnits: 250 })).toEqual({ dueAt: 500, remaining: 100, status: "ok" });
  });

  it("el aviso aparece al acercarse al horómetro y se limpia al hacer el servicio (que reinicia el plan)", async () => {
    const s = await setup();
    expect((await erpGet<any[]>(s.owner.token, "maintenance/due")).body).toEqual([]);
    await call("PATCH", `/org/erp/machines/${s.machineId}`, { token: s.owner.token, body: { meterValue: 495 } });
    let due = (await erpGet<any[]>(s.owner.token, "maintenance/due")).body;
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ name: "Cambio de aceite", machine: "Tractor", status: "soon", remaining: 5, dueAt: 500, meterKind: "hours" });
    await call("PATCH", `/org/erp/machines/${s.machineId}`, { token: s.owner.token, body: { meterValue: 510 } });
    due = (await erpGet<any[]>(s.owner.token, "maintenance/due")).body;
    expect(due[0]).toMatchObject({ status: "overdue", remaining: -10 });
    expect((await log(s.owner.token, s, { planId: s.planId, meterValue: 512 })).status).toBe(201);
    expect((await erpGet<any[]>(s.owner.token, "maintenance/due")).body).toEqual([]);
    const all = (await erpGet<any[]>(s.owner.token, "maintenance/due?all=1")).body;
    expect(all[0]).toMatchObject({ dueAt: 762, status: "ok" });
  });

  it("un servicio con costo carga un costo de maquinaria; borrarlo lo revierte; USD usa el tipo de cambio", async () => {
    const s = await setup();
    await call("PUT", "/org/erp/exchange-rates/2026-11-01", { token: s.owner.token, body: { usdToPyg: 7000 } });
    const r = await log(s.owner.token, s, { kind: "repair", description: "Bomba hidráulica", amount: 20_000, currency: "USD", meterValue: 600 });
    expect(r.status).toBe(201);
    const costs = (await erpGet<any>(s.owner.token, "costs")).body.rows;
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ category: "machinery", amountPyg: 1_400_000, origin: "maintenance", originId: r.body.id, farmId: s.farmId });
    const machines = (await erpGet<any[]>(s.owner.token, "machines")).body;
    expect(machines[0].meterValue).toBe(600);
    const logs = (await erpGet<any[]>(s.owner.token, `maintenance/logs?machineId=${s.machineId}`)).body;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ kind: "repair", amountPyg: 1_400_000 });
    await call("DELETE", `/org/erp/maintenance/logs/${r.body.id}`, { token: s.owner.token });
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toEqual([]);
    expect((await erpGet<any[]>(s.owner.token, "maintenance/logs")).body).toEqual([]);
  });

  it("valida: máquina y plan de la organización, plan de la misma máquina, moneda con monto", async () => {
    const s = await setup();
    const other = await setup();
    expect((await log(s.owner.token, { ...s, machineId: other.machineId })).status).toBe(404);
    expect((await log(s.owner.token, s, { planId: other.planId })).status).toBe(404);
    const m2 = await erpPost(s.owner.token, "machines", { name: "Camión", type: "truck", meterKind: "km" });
    expect((await log(s.owner.token, { ...s, machineId: m2.body.id }, { planId: s.planId })).status).toBe(400);
    expect((await log(s.owner.token, s, { amount: 1000 })).status).toBe(400);
    expect((await erpPost(s.owner.token, "maintenance-plans", { machineId: other.machineId, name: "X", everyUnits: 10 })).status).toBe(404);
    expect((await erpPost(s.owner.token, "maintenance-plans", { machineId: s.machineId, name: "X", everyUnits: 0 })).status).toBe(400);
  });

  it("permisos: el agrónomo ve planes, avisos e historial sin montos y no escribe; el empleado no entra", async () => {
    const s = await setup();
    await log(s.admin.token, s, { amount: 100_000, currency: "PYG" });
    expect((await erpGet<any[]>(s.agro.token, "maintenance-plans")).status).toBe(200);
    expect((await erpGet<any[]>(s.agro.token, "maintenance/due")).status).toBe(200);
    const logs = (await erpGet<any[]>(s.agro.token, "maintenance/logs")).body;
    expect(logs).toHaveLength(1);
    expect(logs[0].amount).toBeUndefined();
    expect(logs[0].amountPyg).toBeUndefined();
    expect((await log(s.agro.token, s)).status).toBe(403);
    expect((await erpPost(s.agro.token, "maintenance-plans", { machineId: s.machineId, name: "X", everyUnits: 10 })).status).toBe(403);
    expect((await call("DELETE", `/org/erp/maintenance/logs/${logs[0].id}`, { token: s.agro.token })).status).toBe(403);
    expect((await erpGet<any[]>(s.agro.token, "costs")).status).toBe(403);
    for (const p of ["maintenance-plans", "maintenance/due", "maintenance/logs"]) expect((await erpGet(s.worker.token, p)).status).toBe(403);
    expect((await log(s.worker.token, s)).status).toBe(403);
  });
});
