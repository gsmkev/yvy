/** E-26: adelantos, pagos y saldo por empleado. */
import { describe, expect, it } from "vitest";
import { employeeBalance, statement } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

async function setup() {
  const s = await erpSetup();
  const a = await erpPost(s.owner.token, "employees", { name: "Juan Peón", dailyWagePyg: 100_000 });
  const b = await erpPost(s.owner.token, "employees", { name: "Ana Cocinera", dailyWagePyg: 80_000 });
  return { ...s, juan: a.body.id as string, ana: b.body.id as string };
}
const pay = (token: string, employeeId: string, kind: string, amountPyg: number, date = "2026-11-10") =>
  erpPost(token, "employee-payments", { employeeId, kind, amountPyg, date });
const mark = (token: string, date: string, entries: unknown[]) => erpPost(token, "attendance", { date, entries });

describe("adelantos, pagos y saldo (E-26)", () => {
  it("funciones puras: saldo y cuenta corriente con saldo acumulado", () => {
    expect(employeeBalance(500_000, 100_000, 300_000)).toBe(100_000);
    expect(employeeBalance(100_000, 300_000, 0)).toBe(-200_000);
    const st = statement([
      { id: "b", date: "2026-11-02", kind: "advance", amountPyg: -50_000, note: null },
      { id: "a", date: "2026-11-02", kind: "wage", amountPyg: 100_000, note: "Siembra" },
      { id: "c", date: "2026-11-01", kind: "wage", amountPyg: 100_000, note: null },
    ]);
    expect(st.map((l) => [l.id, l.balancePyg])).toEqual([["c", 100_000], ["a", 200_000], ["b", 150_000]]);
  });

  it("el saldo es lo devengado menos adelantos y pagos, y un adelanto de más queda en negativo", async () => {
    const s = await setup();
    await mark(s.owner.token, "2026-11-03", [{ employeeId: s.juan, days: 1 }, { employeeId: s.ana, days: 0.5 }]);
    await mark(s.owner.token, "2026-11-04", [{ employeeId: s.juan, days: 1 }]);
    await pay(s.owner.token, s.juan, "advance", 50_000, "2026-11-04");
    await pay(s.owner.token, s.juan, "payment", 100_000, "2026-11-08");
    await pay(s.owner.token, s.ana, "advance", 70_000, "2026-11-04");
    const b = (await erpGet<any[]>(s.owner.token, "employees/balance")).body;
    expect(b.find((x) => x.employeeId === s.juan)).toMatchObject({ days: 2, accruedPyg: 200_000, advancesPyg: 50_000, paymentsPyg: 100_000, balancePyg: 50_000 });
    expect(b.find((x) => x.employeeId === s.ana)).toMatchObject({ days: 0.5, accruedPyg: 40_000, advancesPyg: 70_000, balancePyg: -30_000 });
    // a una fecha de corte
    const early = (await erpGet<any[]>(s.owner.token, "employees/balance?to=2026-11-03")).body;
    expect(early.find((x) => x.employeeId === s.juan)).toMatchObject({ accruedPyg: 100_000, advancesPyg: 0, balancePyg: 100_000 });
  });

  it("la cuenta corriente ordena por fecha y acumula; borrar un pago devuelve el saldo", async () => {
    const s = await setup();
    await mark(s.owner.token, "2026-11-03", [{ employeeId: s.juan, days: 1 }]);
    const p = await pay(s.owner.token, s.juan, "advance", 30_000, "2026-11-03");
    await pay(s.owner.token, s.juan, "payment", 70_000, "2026-11-09");
    let st = (await erpGet<any[]>(s.owner.token, `employees/${s.juan}/statement`)).body;
    expect(st.map((l) => [l.kind, l.amountPyg, l.balancePyg])).toEqual([["wage", 100_000, 100_000], ["advance", -30_000, 70_000], ["payment", -70_000, 0]]);
    expect((await call("DELETE", `/org/erp/employee-payments/${p.body.id}`, { token: s.owner.token })).status).toBe(200);
    st = (await erpGet<any[]>(s.owner.token, `employees/${s.juan}/statement`)).body;
    expect(st.at(-1).balancePyg).toBe(30_000);
    expect((await erpGet<any[]>(s.owner.token, "employee-payments")).body).toHaveLength(1);
    expect((await call("DELETE", `/org/erp/employee-payments/${p.body.id}`, { token: s.owner.token })).status).toBe(404);
  });

  it("valida: empleado de la organización, monto positivo entero, tipo y fecha", async () => {
    const s = await setup();
    const other = await setup();
    expect((await pay(s.owner.token, other.juan, "advance", 1000)).status).toBe(404);
    expect((await pay(s.owner.token, s.juan, "advance", 0)).status).toBe(400);
    expect((await pay(s.owner.token, s.juan, "advance", 10.5)).status).toBe(400);
    expect((await pay(s.owner.token, s.juan, "regalo", 1000)).status).toBe(400);
    expect((await pay(s.owner.token, s.juan, "advance", 1000, "ayer")).status).toBe(400);
    expect((await erpGet(s.owner.token, `employees/${other.juan}/statement`)).status).toBe(404);
  });

  it("permisos: son montos, solo dueño y administrador (el agrónomo y el empleado, no)", async () => {
    const s = await setup();
    expect((await pay(s.admin.token, s.juan, "advance", 1000)).status).toBe(201);
    for (const who of [s.agro, s.worker]) {
      expect((await pay(who.token, s.juan, "advance", 1000)).status).toBe(403);
      for (const p of ["employee-payments", "employees/balance", `employees/${s.juan}/statement`]) expect((await erpGet(who.token, p)).status).toBe(403);
      expect((await call("DELETE", "/org/erp/employee-payments/x", { token: who.token })).status).toBe(403);
    }
  });
});
