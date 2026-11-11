import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { call, createFarmWithPlots, createOrgWithOwner, createStaff, db } from "./helpers";

describe("panel interno: búsqueda, prueba y soporte (P-12)", () => {
  it("busca organizaciones por nombre, id o email de un miembro; el dueño no entra", async () => {
    const staff = await createStaff();
    const a = await createOrgWithOwner("Estancia Los Ñandúes");
    const b = await createOrgWithOwner("Agro 100% Itapúa");
    const names = async (q: string) =>
      (await call<any>("GET", `/admin/metrics?q=${encodeURIComponent(q)}`, { token: staff.token })).body.organizations.map(
        (o: { name: string }) => o.name,
      );
    expect(await names("andúes")).toEqual(["Estancia Los Ñandúes"]);
    expect(await names(b.orgId)).toEqual(["Agro 100% Itapúa"]);
    const [u] = await db().select().from(s.users).where(eq(s.users.id, a.userId));
    expect(await names(u!.email!.slice(0, 12))).toContain("Estancia Los Ñandúes");
    // % y _ son literales, no comodines
    expect(await names("100%")).toEqual(["Agro 100% Itapúa"]);
    expect(await names("%")).toEqual(["Agro 100% Itapúa"]);
    expect(await names("zzz-no-existe")).toEqual([]);
    expect((await call("GET", "/admin/metrics?q=a", { token: a.token })).status).toBe(403);
  });

  it("extiende la prueba desde hoy o desde el fin actual, y reactiva una bloqueada", async () => {
    const staff = await createStaff();
    const o = await createOrgWithOwner();
    const now = Date.now();
    await db()
      .update(s.organizations)
      .set({ plan: "blocked", trialEndsAt: now - 5 * 86_400_000 })
      .where(eq(s.organizations.id, o.orgId));
    const url = `/admin/orgs/${o.orgId}/extend-trial`;
    const r = await call<{ trialEndsAt: number }>("POST", url, { token: staff.token, body: { days: 30 } });
    expect(r.status).toBe(200);
    expect(r.body.trialEndsAt).toBeGreaterThan(now + 29.9 * 86_400_000);
    expect(r.body.trialEndsAt).toBeLessThan(now + 30.1 * 86_400_000);
    const [org] = await db().select().from(s.organizations).where(eq(s.organizations.id, o.orgId));
    expect(org!.plan).toBe("trial");
    // otra vez: suma sobre el fin actual
    const r2 = await call<{ trialEndsAt: number }>("POST", url, { token: staff.token, body: { days: 10 } });
    expect(r2.body.trialEndsAt - r.body.trialEndsAt).toBe(10 * 86_400_000);
    expect((await call("POST", url, { token: staff.token, body: { days: 0 } })).status).toBe(400);
    expect((await call("POST", url, { token: o.token, body: { days: 5 } })).status).toBe(403);
    await db().update(s.organizations).set({ plan: "active" }).where(eq(s.organizations.id, o.orgId));
    expect((await call("POST", url, { token: staff.token, body: { days: 5 } })).status).toBe(400);
    expect((await call("POST", `/admin/orgs/nada/extend-trial`, { token: staff.token, body: { days: 5 } })).status).toBe(404);
  });

  it("ver como soporte: lee, no escribe, no escala y deja auditoría", async () => {
    const staff = await createStaff();
    const o = await createOrgWithOwner("Cliente");
    const { farmId } = await createFarmWithPlots(o.token, 1);
    const url = `/admin/orgs/${o.orgId}/support-session`;
    expect((await call("POST", url, { token: o.token })).status).toBe(403);

    const r = await call<any>("POST", url, { token: staff.token });
    expect(r.status).toBe(200);
    expect(r.body.organization).toMatchObject({ id: o.orgId, role: "owner" });
    expect(r.body.refreshToken).toBe("");
    const support = r.body.accessToken as string;

    // lee lo del cliente
    const farms = await call<any[]>("GET", "/org/farms", { token: support });
    expect(farms.body.map((f) => f.id)).toEqual([farmId]);
    const me = await call<any>("GET", "/me", { token: support });
    expect(me.body).toMatchObject({ support: true, role: "owner", isStaff: false });
    // /me no marca actividad del dueño
    expect(await db().select().from(s.activityDaily).where(eq(s.activityDaily.userId, o.userId))).toHaveLength(0);

    // no escribe: ni PATCH, ni POST, ni DELETE
    expect((await call("PATCH", `/org/farms/${farmId}`, { token: support, body: { name: "X" } })).status).toBe(403);
    expect((await call("POST", "/org/members", { token: support, body: { fullName: "Pepe", role: "worker" } })).status).toBe(403);
    expect((await call("DELETE", `/org/farms/${farmId}`, { token: support })).status).toBe(403);
    // ni pedir una sesión normal del dueño
    expect(
      (await call("POST", "/auth/switch", { token: support, body: { organizationId: o.orgId, deviceId: "x" } })).status,
    ).toBe(403);
    // ni entrar al panel interno: el dueño no es del equipo
    expect((await call("GET", "/admin/metrics", { token: support })).status).toBe(403);
    expect((await call<any[]>("GET", "/org/farms", { token: o.token })).body[0].name).toBe("La Esperanza");

    const log = await call<any[]>("GET", `/admin/audit?orgId=${o.orgId}`, { token: staff.token });
    expect(log.body).toHaveLength(1);
    expect(log.body[0]).toMatchObject({ action: "support_session", organizationId: o.orgId, actor: "staff@yvy.test" });
  });

  it("sin dueño activo no hay sesión de soporte; los cambios de plan también se auditan", async () => {
    const staff = await createStaff();
    const o = await createOrgWithOwner();
    await call("POST", `/admin/orgs/${o.orgId}/plan`, { token: staff.token, body: { plan: "active", maxHa: 500 } });
    await db().update(s.memberships).set({ status: "disabled" }).where(eq(s.memberships.organizationId, o.orgId));
    expect((await call("POST", `/admin/orgs/${o.orgId}/support-session`, { token: staff.token })).status).toBe(404);
    const log = await call<any[]>("GET", `/admin/audit?orgId=${o.orgId}`, { token: staff.token });
    expect(log.body.map((r) => r.action)).toEqual(["plan_changed"]);
    expect(JSON.parse(log.body[0].detail)).toMatchObject({ plan: "active", maxHa: 500 });
  });
});
