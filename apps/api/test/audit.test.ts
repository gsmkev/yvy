/** K-06: registro de quién cambió qué y cuándo. */
import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, createStaff } from "./helpers";
import { push, rec } from "./records-helpers";

type Audit = { rows: { action: string; entity: string; entityId: string; actor: string; detail: string }[]; hasMore: boolean };

describe("K-06 · registro de cambios", () => {
  it("anota altas, ediciones, borrados, equipo y tareas con quién las hizo", async () => {
    const owner = await createOrgWithOwner();
    const admin = await addMemberAndLogin(owner.token, "admin", "Ana Admin");
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const worker = await addMemberAndLogin(owner.token, "worker", "Peón");

    await call("PATCH", `/org/plots/${plotIds[0]}`, { token: admin.token, body: { name: "Lote Norte" } });
    await call("POST", "/org/tasks", {
      token: admin.token,
      body: { farmId, plotId: plotIds[0], assigneeId: worker.userId, title: "Revisar", dueDate: "2030-03-01" },
    });
    await call("DELETE", `/org/plots/${plotIds[1]}`, { token: owner.token });
    await call("DELETE", `/org/members/${worker.userId}`, { token: owner.token });

    const res = await call<Audit>("GET", "/org/audit", { token: owner.token });
    expect(res.status).toBe(200);
    const actions = res.body.rows.map((r) => r.action);
    for (const a of ["farm_create", "plot_create", "member_add", "plot_update", "task_create", "plot_delete", "member_remove"])
      expect(actions, a).toContain(a);
    const edit = res.body.rows.find((r) => r.action === "plot_update")!;
    expect(edit.actor).toBe("Ana Admin");
    expect(edit.entityId).toBe(plotIds[0]);
    expect(JSON.parse(edit.detail)).toEqual({ values: { name: "Lote Norte" } });
    // más nuevo primero
    expect(actions[0]).toBe("member_remove");
  });

  it("anota el borrado de registros hecho desde el celular", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const r = rec(farmId, null, "rain", { mm: 3, readAt: Date.now() });
    await push(owner.token, [r]);
    await push(owner.token, [{ mutationId: crypto.randomUUID(), kind: "records.delete", row: { id: r.row.id } }]);
    const res = await call<Audit>("GET", "/org/audit?entity=record", { token: owner.token });
    expect(res.body.rows.map((x) => [x.action, x.entityId])).toEqual([["record_delete", r.row.id]]);
  });

  it("solo el dueño lo ve, y cada organización ve lo suyo", async () => {
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    await createFarmWithPlots(a.token, 1);
    const admin = await addMemberAndLogin(a.token, "admin");
    expect((await call("GET", "/org/audit", { token: admin.token })).status).toBe(403);
    expect((await call<Audit>("GET", "/org/audit", { token: b.token })).body.rows).toEqual([]);
  });

  it("pagina con `before` y el panel interno ve los cambios de una organización", async () => {
    const owner = await createOrgWithOwner();
    await createFarmWithPlots(owner.token, 1);
    const first = await call<Audit>("GET", "/org/audit", { token: owner.token });
    expect(first.body.hasMore).toBe(false);
    const staff = await createStaff();
    const internal = await call<{ action: string }[]>("GET", `/admin/audit?orgId=${owner.orgId}&scope=org`, { token: staff.token });
    expect(internal.status).toBe(200);
    expect(internal.body.map((r) => r.action)).toContain("farm_create");
    // por defecto el panel solo muestra las acciones del equipo
    const own = await call<{ action: string }[]>("GET", `/admin/audit?orgId=${owner.orgId}`, { token: staff.token });
    expect(own.body).toEqual([]);
  });
});
