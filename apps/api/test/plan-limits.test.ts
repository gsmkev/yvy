import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { LIMITS, planLimits } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createOrgWithOwner, createStaff, db, square } from "./helpers";

const setPlan = (orgId: string, v: Partial<typeof s.organizations.$inferInsert>) =>
  db().update(s.organizations).set(v).where(eq(s.organizations.id, orgId));
const newFarm = (token: string, size: number) =>
  call<{ id: string; error?: string }>("POST", "/org/farms", {
    token,
    body: { name: "Estancia", geometry: square(-55.9, -27.2, size) },
  });

describe("topes del plan (P-10)", () => {
  it("planLimits: los propios mandan; sin ellos, los del plan", () => {
    expect(planLimits("trial")).toEqual(LIMITS.plans.trial);
    expect(planLimits("active", { maxHa: 100 })).toEqual({ maxHa: 100, maxUsers: LIMITS.plans.active.maxUsers });
    expect(planLimits("demo")).toEqual({ maxHa: null, maxUsers: null });
    expect(planLimits("rara")).toEqual(LIMITS.plans.trial);
  });

  it("estancias: rechaza con 402 y un mensaje claro al pasar las hectáreas", async () => {
    const owner = await createOrgWithOwner();
    await setPlan(owner.orgId, { maxHa: 1500 }); // 0,1° ≈ 12.000 ha, 0,03° ≈ 980 ha
    const big = await newFarm(owner.token, 0.1);
    expect(big.status).toBe(402);
    expect(big.body.error).toMatch(/Tu plan permite hasta 1\.500 ha/);
    expect((await newFarm(owner.token, 0.03)).status).toBe(201);
    // la suma cuenta: otra de ~1.100 ha ya no entra (~1.960 ha)
    expect((await newFarm(owner.token, 0.03)).status).toBe(402);
    // borrar una libera lugar
    const list = await call<{ id: string }[]>("GET", "/org/farms", { token: owner.token });
    await call("DELETE", `/org/farms/${list.body[0]!.id}`, { token: owner.token });
    expect((await newFarm(owner.token, 0.03)).status).toBe(201);
  });

  it("lotes: la suma de lotes tampoco pasa el tope", async () => {
    const owner = await createOrgWithOwner();
    const farm = await newFarm(owner.token, 0.05);
    expect(farm.status).toBe(201);
    await setPlan(owner.orgId, { maxHa: 1500 });
    const plot = (size: number) => ({ name: "L", kind: "crop", geometry: square(-55.89, -27.21, size) });
    const url = `/org/farms/${farm.body.id}/plots`;
    expect((await call("POST", url, { token: owner.token, body: { plots: [plot(0.02)] } })).status).toBe(201); // ~480 ha
    const r = await call<{ error: string }>("POST", url, { token: owner.token, body: { plots: [plot(0.04), plot(0.04)] } });
    expect(r.status).toBe(402);
    expect(r.body.error).toMatch(/Tu plan permite/);
  });

  it("personas: tope de usuarios; volver a agregar a alguien que ya está no cuenta", async () => {
    const owner = await createOrgWithOwner();
    await setPlan(owner.orgId, { maxUsers: 2 });
    const w = await addMemberAndLogin(owner.token, "worker", "Uno");
    const add = (name: string, email?: string) =>
      call<{ error?: string }>("POST", "/org/members", {
        token: owner.token,
        body: { fullName: name, role: email ? "agronomist" : "worker", email: email ?? null },
      });
    const over = await add("Dos");
    expect(over.status).toBe(402);
    expect(over.body.error).toMatch(/hasta 2 personas/);
    expect(w.userId).toBeTruthy();
    // ya existente con email: no suma
    const agro = await call("POST", "/org/members", {
      token: owner.token,
      body: { fullName: "Agro", role: "agronomist", email: "agro@test.py" },
    });
    expect(agro.status).toBe(402);
    await setPlan(owner.orgId, { maxUsers: 3 });
    expect((await add("Agro", "agro@test.py")).status).toBe(201);
    expect((await add("Agro", "agro@test.py")).status).toBe(201); // idempotente: ya es miembro
  });

  it("el plan demo no tiene tope", async () => {
    const owner = await createOrgWithOwner();
    await setPlan(owner.orgId, { plan: "demo", maxHa: null });
    expect(planLimits("demo").maxHa).toBeNull();
  });

  it("el equipo cambia plan y topes desde el panel; el dueño no", async () => {
    const owner = await createOrgWithOwner();
    const staff = await createStaff();
    const url = `/admin/orgs/${owner.orgId}/plan`;
    expect((await call("POST", url, { token: owner.token, body: { plan: "active", maxHa: 9e6 } })).status).toBe(403);
    expect((await call("POST", url, { token: staff.token, body: { plan: "active", maxHa: -5 } })).status).toBe(400);
    expect((await call("POST", url, { token: staff.token, body: { plan: "active", maxHa: 100, maxUsers: 3 } })).status).toBe(200);
    expect((await newFarm(owner.token, 0.03)).status).toBe(402); // ~1.100 ha > 100
    const m = await call<any>("GET", "/admin/metrics", { token: staff.token });
    const org = m.body.organizations.find((o: { id: string }) => o.id === owner.orgId);
    expect(org.limits).toEqual({ maxHa: 100, maxUsers: 3 });
    expect(org.users).toBe(1);
    // null borra el tope propio y vuelve al del plan
    await call("POST", url, { token: staff.token, body: { plan: "active", maxHa: null } });
    const again = await call<any>("GET", "/admin/metrics", { token: staff.token });
    expect(again.body.organizations.find((o: { id: string }) => o.id === owner.orgId).limits).toEqual({
      maxHa: LIMITS.plans.active.maxHa,
      maxUsers: 3,
    });
  });
});
