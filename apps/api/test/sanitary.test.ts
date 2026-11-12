/** Calendario sanitario (G-10): eventos, estado hecho o vencido, tareas para empleados y permisos. */
import { describe, expect, it } from "vitest";
import { addDays, localDate } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";
import { push, rec } from "./records-helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
  // Potreros 0 y 1 son pasturas; el 2 sigue siendo agrícola.
  for (const id of plotIds.slice(0, 2))
    await call("PATCH", `/org/plots/${id}`, { token: owner.token, body: { kind: "pasture" } });
  const ganadero = await addMemberAndLogin(owner.token, "worker", "Peón de hacienda");
  const agricola = await addMemberAndLogin(owner.token, "worker", "Peón de soja");
  await call("PUT", `/org/members/${ganadero.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]!] } });
  await call("PUT", `/org/members/${agricola.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[2]!] } });
  return { owner, ganadero, agricola, farmId, plotIds };
}

const create = (token: string, body: unknown) => call<any>("POST", "/org/sanitary-events", { token, body });
const list = (token: string, month: string, farmId?: string) =>
  call<any>("GET", `/org/sanitary-events?month=${month}${farmId ? `&farmId=${farmId}` : ""}`, { token });
const today = () => localDate(Date.now());

describe("calendario sanitario", () => {
  it("crea el evento y una tarea solo para empleados asignados a un potrero", async () => {
    const { owner, ganadero, agricola, farmId } = await setup();
    const date = addDays(today(), 20);
    const r = await create(owner.token, {
      reason: "aftosa",
      plannedDate: date,
      categories: ["vaca", "ternero"],
      product: "Aftosa bivalente",
    });
    expect(r.status).toBe(201);
    expect(r.body.tasksCreated).toBe(1);
    const tasks = await pullAll(ganadero.token, "tasks");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      kind: "health",
      dueDate: date,
      farmId,
      assigneeId: ganadero.userId,
      title: "Vacuna contra la aftosa: Aftosa bivalente",
    });
    expect(await pullAll(agricola.token, "tasks")).toHaveLength(0);
  });

  it("sin tareas si se pide así", async () => {
    const { owner, ganadero } = await setup();
    const r = await create(owner.token, { reason: "carbunclo", plannedDate: addDays(today(), 5), createTasks: false });
    expect(r.body.tasksCreated).toBe(0);
    expect(await pullAll(ganadero.token, "tasks")).toHaveLength(0);
  });

  it("estado: vencido, hecho cuando hay un registro health que corresponde, y próximo", async () => {
    const { owner, farmId, plotIds } = await setup();
    const past = addDays(today(), -10);
    const future = addDays(today(), 40);
    await create(owner.token, { reason: "aftosa", plannedDate: past, createTasks: false });
    await create(owner.token, { reason: "brucelosis", plannedDate: past, createTasks: false });
    await create(owner.token, { reason: "garrapata", plannedDate: future, createTasks: false });
    const state = async (month: string) =>
      Object.fromEntries((await list(owner.token, month)).body.map((e: any) => [e.reason, e.state]));
    expect(await state(past.slice(0, 7))).toMatchObject({ aftosa: "overdue", brucelosis: "overdue" });
    expect(await state(future.slice(0, 7))).toMatchObject({ garrapata: "upcoming" });
    // Un tratamiento de aftosa cargado en el campo cumple el evento de aftosa y no el de brucelosis.
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "health", { reason: "aftosa", product: "Aftosa", counts: { vaca: 30 } }),
    ]);
    const after = await list(owner.token, past.slice(0, 7));
    const byReason = Object.fromEntries(after.body.map((e: any) => [e.reason, e]));
    expect(byReason.aftosa.state).toBe("done");
    expect(byReason.aftosa.doneAt).toBeGreaterThan(0);
    expect(byReason.brucelosis.state).toBe("overdue");
  });

  it("un evento de una estancia no se cumple con un tratamiento de otra", async () => {
    const { owner, farmId } = await setup();
    const other = await createFarmWithPlots(owner.token, 1);
    const past = addDays(today(), -3);
    await create(owner.token, { reason: "desparasitacion", plannedDate: past, farmId, createTasks: false });
    await push(owner.token, [
      rec(other.farmId, other.plotIds[0]!, "health", { reason: "desparasitacion", product: "Ivermectina", counts: { vaca: 5 } }),
    ]);
    expect((await list(owner.token, past.slice(0, 7))).body[0].state).toBe("overdue");
    await push(owner.token, [
      rec(farmId, null, "health", { reason: "desparasitacion", product: "Ivermectina", counts: { vaca: 5 } }),
    ]);
    expect((await list(owner.token, past.slice(0, 7))).body[0].state).toBe("done");
  });

  it("lista solo el mes pedido y puede filtrar por estancia", async () => {
    const { owner, farmId } = await setup();
    const other = await createFarmWithPlots(owner.token, 1);
    const d = addDays(today(), 70);
    await create(owner.token, { reason: "aftosa", plannedDate: d, farmId, createTasks: false });
    await create(owner.token, { reason: "carbunclo", plannedDate: d, farmId: other.farmId, createTasks: false });
    await create(owner.token, { reason: "brucelosis", plannedDate: d, createTasks: false });
    const month = d.slice(0, 7);
    expect((await list(owner.token, month)).body).toHaveLength(3);
    expect((await list(owner.token, month, farmId)).body.map((e: any) => e.reason).sort()).toEqual(["aftosa", "brucelosis"]);
    expect((await list(owner.token, addDays(d, 62).slice(0, 7))).body).toHaveLength(0);
  });

  it("valida el cuerpo", async () => {
    const { owner } = await setup();
    expect((await create(owner.token, { reason: "magia", plannedDate: "2026-12-01" })).status).toBe(400);
    expect((await create(owner.token, { reason: "aftosa", plannedDate: "mañana" })).status).toBe(400);
    expect((await list(owner.token, "2026-13")).status).toBe(400);
  });

  it("permisos: el empleado no ve ni planifica; dueño, admin y agrónomo sí", async () => {
    const { owner, ganadero } = await setup();
    const body = { reason: "aftosa", plannedDate: addDays(today(), 9), createTasks: false };
    expect((await create(ganadero.token, body)).status).toBe(403);
    expect((await list(ganadero.token, today().slice(0, 7))).status).toBe(403);
    const made = await create(owner.token, body);
    expect((await call("DELETE", `/org/sanitary-events/${made.body.id}`, { token: ganadero.token })).status).toBe(403);
    for (const role of ["admin", "agronomist"] as const) {
      const u = await addMemberAndLogin(owner.token, role);
      expect((await create(u.token, body)).status).toBe(201);
      expect((await list(u.token, body.plannedDate.slice(0, 7))).status).toBe(200);
    }
  });

  it("borrar, y no mezcla organizaciones", async () => {
    const { owner } = await setup();
    const date = addDays(today(), 12);
    const made = await create(owner.token, { reason: "aftosa", plannedDate: date, createTasks: false });
    const stranger = await createOrgWithOwner("Otra");
    expect((await call("DELETE", `/org/sanitary-events/${made.body.id}`, { token: stranger.token })).status).toBe(404);
    expect((await list(stranger.token, date.slice(0, 7))).body).toHaveLength(0);
    expect((await call("DELETE", `/org/sanitary-events/${made.body.id}`, { token: owner.token })).status).toBe(200);
    expect((await list(owner.token, date.slice(0, 7))).body).toHaveLength(0);
    expect((await call("DELETE", `/org/sanitary-events/${made.body.id}`, { token: owner.token })).status).toBe(404);
    // un evento con estancia de otra organización se rechaza
    const foreign = await createFarmWithPlots(stranger.token, 1);
    expect((await create(owner.token, { reason: "aftosa", plannedDate: date, farmId: foreign.farmId })).status).toBe(404);
  });
});
