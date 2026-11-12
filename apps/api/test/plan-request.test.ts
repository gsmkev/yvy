import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, createStaff, db } from "./helpers";

const ask = (token: string, body: Record<string, unknown> = { plan: "active" }) =>
  call<{ id: string; error?: string }>("POST", "/org/plan-request", { token, body });

describe("plan y pedido de cambio desde la web (P-10)", () => {
  it("el dueño ve su plan, los topes efectivos y el uso", async () => {
    const owner = await createOrgWithOwner();
    await createFarmWithPlots(owner.token, 1);
    await addMemberAndLogin(owner.token, "worker");
    const r = await call<any>("GET", "/org/plan", { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.plan).toBe("trial");
    expect(r.body.limits).toEqual(LIMITS.plans.trial);
    expect(r.body.plans.active).toEqual(LIMITS.plans.active);
    expect(r.body.usage.ha).toBeGreaterThan(0);
    expect(r.body.usage.users).toBe(2); // dueño y empleado
    expect(r.body.pending).toBeNull();
  });

  it("permisos: solo el dueño ve el plan y pide cambios", async () => {
    const owner = await createOrgWithOwner();
    for (const role of ["admin", "agronomist", "supervisor", "worker"] as const) {
      const m = await addMemberAndLogin(owner.token, role);
      expect((await call("GET", "/org/plan", { token: m.token })).status).toBe(403);
      expect((await ask(m.token)).status).toBe(403);
      expect((await call("DELETE", "/org/plan-request", { token: m.token })).status).toBe(403);
    }
    expect((await call("GET", "/org/plan")).status).toBe(401);
  });

  it("un pedido pendiente por organización; se valida, se cancela y se puede volver a pedir", async () => {
    const owner = await createOrgWithOwner();
    expect((await ask(owner.token, { plan: "gratis" })).status).toBe(400);
    expect((await ask(owner.token, { plan: "active", maxHa: -5 })).status).toBe(400);
    expect((await ask(owner.token, { plan: "active", maxUsers: 2.5 })).status).toBe(400);
    expect(
      (await ask(owner.token, { plan: "active", note: "x".repeat(LIMITS.planRequest.noteLength + 1) })).status,
    ).toBe(400);
    const first = await ask(owner.token, { plan: "active", maxHa: 600_000, note: "  Sumo dos estancias  " });
    expect(first.status).toBe(201);
    expect((await ask(owner.token)).status).toBe(409);
    const view = await call<any>("GET", "/org/plan", { token: owner.token });
    expect(view.body.pending).toMatchObject({ id: first.body.id, plan: "active", maxHa: 600_000, note: "Sumo dos estancias" });
    expect((await call("DELETE", "/org/plan-request", { token: owner.token })).status).toBe(200);
    expect((await call<any>("GET", "/org/plan", { token: owner.token })).body.pending).toBeNull();
    expect((await ask(owner.token)).status).toBe(201);
  });

  it("no deja pedir lo que ya tiene", async () => {
    const owner = await createOrgWithOwner();
    await db().update(s.organizations).set({ plan: "active" }).where(eq(s.organizations.id, owner.orgId));
    expect((await ask(owner.token)).status).toBe(400);
    expect((await ask(owner.token, { plan: "active", maxHa: LIMITS.plans.active.maxHa })).status).toBe(400);
    expect((await ask(owner.token, { plan: "active", maxUsers: LIMITS.plans.active.maxUsers + 1 })).status).toBe(201);
  });

  it("se puede pedir con la prueba vencida (la gestión está en solo lectura)", async () => {
    const owner = await createOrgWithOwner();
    await db()
      .update(s.organizations)
      .set({ trialEndsAt: Date.now() - 86_400_000 })
      .where(eq(s.organizations.id, owner.orgId));
    expect((await call("POST", "/org/farms", { token: owner.token, body: {} })).status).toBe(402);
    expect((await ask(owner.token)).status).toBe(201);
    expect((await call("DELETE", "/org/plan-request", { token: owner.token })).status).toBe(200);
  });

  it("el panel interno lista los pendientes y al aprobar aplica el plan y los topes, con auditoría", async () => {
    const staff = await createStaff();
    const owner = await createOrgWithOwner("Agro Sur");
    const other = await createOrgWithOwner("Otra");
    await ask(owner.token, { plan: "active", maxHa: 700_000, maxUsers: 150 });
    await ask(other.token);
    const list = await call<any[]>("GET", "/admin/plan-requests", { token: staff.token });
    expect(list.status).toBe(200);
    const names = list.body.map((r) => r.organization);
    expect(names).toContain("Agro Sur");
    expect(names).toContain("Otra");
    const mine = list.body.find((r) => r.organization === "Agro Sur");
    expect(mine).toMatchObject({ currentPlan: "trial", plan: "active", maxHa: 700_000, maxUsers: 150 });

    expect((await call("POST", `/admin/plan-requests/${mine.id}/approve`, { token: owner.token, body: {} })).status).toBe(403);
    expect((await call("GET", "/admin/plan-requests", { token: owner.token })).status).toBe(403);
    expect((await call("POST", `/admin/plan-requests/${mine.id}/approve`, { token: staff.token, body: {} })).status).toBe(200);
    const [org] = await db().select().from(s.organizations).where(eq(s.organizations.id, owner.orgId));
    expect(org).toMatchObject({ plan: "active", trialEndsAt: null, maxHa: 700_000, maxUsers: 150 });
    // la otra organización no se tocó
    const [o2] = await db().select().from(s.organizations).where(eq(s.organizations.id, other.orgId));
    expect(o2!.plan).toBe("trial");
    expect((await call("POST", `/admin/plan-requests/${mine.id}/approve`, { token: staff.token, body: {} })).status).toBe(409);
    const left = await call<any[]>("GET", "/admin/plan-requests", { token: staff.token });
    expect(left.body.map((r) => r.organization)).not.toContain("Agro Sur");

    const view = await call<any>("GET", "/org/plan", { token: owner.token });
    expect(view.body.plan).toBe("active");
    expect(view.body.limits).toEqual({ maxHa: 700_000, maxUsers: 150 });
    expect(view.body.pending).toBeNull();
    expect(view.body.lastResolved.status).toBe("approved");

    const log = await call<any[]>("GET", `/admin/audit?orgId=${owner.orgId}`, { token: staff.token });
    expect(log.body.map((r) => r.action)).toContain("plan_request_approved");
  });

  it("rechazar deja el plan como estaba y guarda el motivo; lo resuelto no se vuelve a resolver", async () => {
    const staff = await createStaff();
    const owner = await createOrgWithOwner();
    await ask(owner.token);
    const [r] = (await call<any[]>("GET", "/admin/plan-requests", { token: staff.token })).body.filter(
      (x) => x.organizationId === owner.orgId,
    );
    expect(
      (await call("POST", `/admin/plan-requests/${r.id}/reject`, { token: staff.token, body: { note: "Falta el pago" } })).status,
    ).toBe(200);
    const [org] = await db().select().from(s.organizations).where(eq(s.organizations.id, owner.orgId));
    expect(org!.plan).toBe("trial");
    expect((await call("POST", `/admin/plan-requests/${r.id}/reject`, { token: staff.token, body: {} })).status).toBe(409);
    expect((await call("POST", `/admin/plan-requests/nada/approve`, { token: staff.token, body: {} })).status).toBe(404);
    const view = await call<any>("GET", "/org/plan", { token: owner.token });
    expect(view.body.lastResolved).toMatchObject({ status: "rejected", resolutionNote: "Falta el pago" });
    // y puede volver a pedir
    expect((await ask(owner.token)).status).toBe(201);
  });
});
