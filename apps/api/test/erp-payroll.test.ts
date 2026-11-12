/** E-27: planilla simple para el contador (jornales, adelantos y pagos por empleado y mes). */
import { describe, expect, it } from "vitest";
import { buildPayroll, monthsBetween } from "@yvy/shared";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

const mark = (token: string, date: string, entries: unknown[]) => erpPost(token, "attendance", { date, entries });
const pay = (token: string, employeeId: string, kind: string, amountPyg: number, date: string) => erpPost(token, "employee-payments", { employeeId, kind, amountPyg, date });

describe("planilla para el contador (E-27)", () => {
  it("funciones puras: meses y filas por empleado y mes", () => {
    expect(monthsBetween("2026-11-15", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    const rows = buildPayroll(
      [{ id: "a", name: "Ana", ci: "123" }, { id: "j", name: "Juan", ci: null }],
      [{ employeeId: "j", month: "2026-11", days: 2, wagePyg: 200_000 }, { employeeId: "a", month: "2026-10", days: 1, wagePyg: 80_000 }],
      [{ employeeId: "j", month: "2026-11", kind: "advance", amountPyg: 50_000 }, { employeeId: "gone", month: "2026-11", kind: "payment", amountPyg: 1 }],
    );
    expect(rows.map((r) => [r.month, r.name, r.balancePyg])).toEqual([["2026-10", "Ana", 80_000], ["2026-11", "Juan", 150_000]]);
  });

  it("suma jornales, adelantos y pagos por empleado y mes, sin calcular aportes", async () => {
    const s = await erpSetup();
    const j = (await erpPost(s.owner.token, "employees", { name: "Juan Peón", ci: "1234567", dailyWagePyg: 100_000 })).body.id;
    const a = (await erpPost(s.owner.token, "employees", { name: "Ana Cocinera", dailyWagePyg: 80_000 })).body.id;
    await mark(s.owner.token, "2026-10-30", [{ employeeId: j, days: 1 }]);
    await mark(s.owner.token, "2026-11-03", [{ employeeId: j, days: 1 }, { employeeId: a, days: 0.5 }]);
    await mark(s.owner.token, "2026-11-04", [{ employeeId: j, days: 1 }]);
    await pay(s.owner.token, j, "advance", 50_000, "2026-11-04");
    await pay(s.owner.token, j, "payment", 100_000, "2026-11-28");
    await pay(s.owner.token, j, "payment", 999, "2026-12-02"); // fuera del período
    const r = await erpGet<any[]>(s.owner.token, "employees/payroll?from=2026-10-01&to=2026-11-30");
    expect(r.status).toBe(200);
    expect(r.body.map((x) => [x.month, x.name])).toEqual([["2026-10", "Juan Peón"], ["2026-11", "Ana Cocinera"], ["2026-11", "Juan Peón"]]);
    expect(r.body[0]).toMatchObject({ ci: "1234567", days: 1, accruedPyg: 100_000, advancesPyg: 0, paymentsPyg: 0, balancePyg: 100_000 });
    expect(r.body[2]).toMatchObject({ days: 2, accruedPyg: 200_000, advancesPyg: 50_000, paymentsPyg: 100_000, balancePyg: 50_000 });
    expect(r.body[1]).toMatchObject({ days: 0.5, accruedPyg: 40_000 });
  });

  it("rechaza períodos invertidos o de más de 24 meses", async () => {
    const s = await erpSetup();
    expect((await erpGet(s.owner.token, "employees/payroll?from=2026-11-30&to=2026-11-01")).status).toBe(400);
    expect((await erpGet(s.owner.token, "employees/payroll?from=2020-01-01&to=2026-11-01")).status).toBe(400);
  });

  it("mismos permisos que los montos: dueño y administrador sí; agrónomo y empleado no", async () => {
    const s = await erpSetup();
    const url = "employees/payroll?from=2026-11-01&to=2026-11-30";
    expect((await erpGet(s.owner.token, url)).status).toBe(200);
    expect((await erpGet(s.admin.token, url)).status).toBe(200);
    expect((await erpGet(s.agro.token, url)).status).toBe(403);
    expect((await erpGet(s.worker.token, url)).status).toBe(403);
  });
});
