/** E-25: personal, asistencia y jornales por día, con lote y labor. */
import { describe, expect, it } from "vitest";
import { wageFor } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

async function setup() {
  const s = await erpSetup();
  const a = await erpPost(s.owner.token, "employees", { name: "Juan Peón", ci: "1234567", dailyWagePyg: 120_000 });
  const b = await erpPost(s.owner.token, "employees", { name: "Pedro Capataz", dailyWagePyg: 200_000 });
  return { ...s, juan: a.body.id as string, pedro: b.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;
const mark = (token: string, date: string, entries: unknown[]) => erpPost(token, "attendance", { date, entries });

describe("asistencia y jornales (E-25)", () => {
  it("wageFor redondea al guaraní", () => {
    expect(wageFor(120_000, 0.5)).toBe(60_000);
    expect(wageFor(100_001, 0.5)).toBe(50_001);
  });

  it("marca el día de varios empleados: jornal vigente, costo de mano de obra al lote y a administración sin lote", async () => {
    const s = await setup();
    const r = await mark(s.owner.token, "2026-11-05", [
      { employeeId: s.juan, days: 1, plotId: s.plotIds[0], labor: "Pulverización" },
      { employeeId: s.pedro, days: 0.5, labor: "Recorrida" },
    ]);
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(2);
    const rows = (await erpGet<any[]>(s.owner.token, "attendance")).body;
    expect(rows.map((x) => [x.employeeId === s.juan ? "juan" : "pedro", x.days, x.wagePyg]).sort()).toEqual([["juan", 1, 120_000], ["pedro", 0.5, 100_000]]);
    expect(rows.find((x) => x.employeeId === s.juan).farmId).toBe(s.farmId);
    const costs = (await erpGet<any>(s.owner.token, "costs")).body.rows;
    const juan = costs.find((c: any) => c.plotId === s.plotIds[0]);
    expect(juan).toMatchObject({ category: "labor", amountPyg: 120_000, activity: "agricultura", origin: "attendance", description: "Juan Peón: Pulverización", farmId: s.farmId });
    expect(costs.find((c: any) => c.plotId === null)).toMatchObject({ category: "labor", amountPyg: 100_000, activity: "administracion" });
  });

  it("un jornal cargado a mano gana; un empleado no pasa de un día por fecha", async () => {
    const s = await setup();
    expect((await mark(s.owner.token, "2026-11-05", [{ employeeId: s.juan, days: 0.5, wagePyg: 90_000 }])).status).toBe(201);
    expect((await mark(s.owner.token, "2026-11-05", [{ employeeId: s.juan, days: 0.5 }])).status).toBe(201);
    const full = await mark(s.owner.token, "2026-11-05", [{ employeeId: s.juan, days: 0.5 }]);
    expect(full.status).toBe(409);
    // todo o nada: el empleado válido de la misma llamada tampoco se guarda
    const mixed = await mark(s.owner.token, "2026-11-05", [{ employeeId: s.pedro, days: 1 }, { employeeId: s.juan, days: 1 }]);
    expect(mixed.status).toBe(409);
    const rows = (await erpGet<any[]>(s.owner.token, "attendance")).body;
    expect(rows.filter((r) => r.employeeId === s.pedro)).toEqual([]);
    expect(rows.find((r) => r.wagePyg === 90_000)).toBeTruthy();
    // el mismo día dos entradas del mismo empleado en una llamada también suman
    expect((await mark(s.owner.token, "2026-11-06", [{ employeeId: s.pedro, days: 1 }, { employeeId: s.pedro, days: 0.5 }])).status).toBe(409);
  });

  it("borrar la asistencia borra su costo; el resumen suma días y jornales por empleado y período", async () => {
    const s = await setup();
    const r1 = await mark(s.owner.token, "2026-11-05", [{ employeeId: s.juan, days: 1 }]);
    await mark(s.owner.token, "2026-11-06", [{ employeeId: s.juan, days: 1 }, { employeeId: s.pedro, days: 1 }]);
    await mark(s.owner.token, "2026-12-01", [{ employeeId: s.juan, days: 0.5 }]);
    let sum = (await erpGet<any[]>(s.owner.token, "attendance/summary?from=2026-11-01&to=2026-11-30")).body;
    expect(sum.find((x) => x.employeeId === s.juan)).toMatchObject({ days: 2, wagePyg: 240_000 });
    expect(sum.find((x) => x.employeeId === s.pedro)).toMatchObject({ days: 1, wagePyg: 200_000 });
    expect((await call("DELETE", `/org/erp/attendance/${r1.body.ids[0]}`, { token: s.owner.token })).status).toBe(200);
    sum = (await erpGet<any[]>(s.owner.token, "attendance/summary?from=2026-11-01&to=2026-11-30")).body;
    expect(sum.find((x) => x.employeeId === s.juan)).toMatchObject({ days: 1, wagePyg: 120_000 });
    expect((await erpGet<any>(s.owner.token, "costs?to=2026-11-05")).body.rows).toEqual([]);
    expect((await call("DELETE", `/org/erp/attendance/${r1.body.ids[0]}`, { token: s.owner.token })).status).toBe(404);
  });

  it("valida: empleado, lote y campaña de la organización; días 1 o 0,5; fecha", async () => {
    const s = await setup();
    const other = await setup();
    expect((await mark(s.owner.token, "2026-11-05", [{ employeeId: other.juan, days: 1 }])).status).toBe(404);
    expect((await mark(s.owner.token, "2026-11-05", [{ employeeId: s.juan, days: 1, plotId: other.plotIds[0] }])).status).toBe(404);
    expect((await mark(s.owner.token, "2026-11-05", [{ employeeId: s.juan, days: 2 }])).status).toBe(400);
    expect((await mark(s.owner.token, "05/11/2026", [{ employeeId: s.juan, days: 1 }])).status).toBe(400);
    expect((await mark(s.owner.token, "2026-11-05", [])).status).toBe(400);
    expect((await erpPost(s.owner.token, "employees", { name: "", dailyWagePyg: 1 })).status).toBe(400);
  });

  it("permisos: son jornales, solo dueño y administrador (el agrónomo y el empleado, no)", async () => {
    const s: S = await setup();
    expect((await mark(s.admin.token, "2026-11-05", [{ employeeId: s.juan, days: 1 }])).status).toBe(201);
    for (const who of [s.agro, s.worker]) {
      expect((await mark(who.token, "2026-11-07", [{ employeeId: s.juan, days: 1 }])).status).toBe(403);
      for (const p of ["employees", "attendance", "attendance/summary"]) expect((await erpGet(who.token, p)).status).toBe(403);
      expect((await erpPost(who.token, "employees", { name: "X", dailyWagePyg: 1 })).status).toBe(403);
      expect((await call("DELETE", `/org/erp/employees/${s.juan}`, { token: who.token })).status).toBe(403);
    }
  });
});
