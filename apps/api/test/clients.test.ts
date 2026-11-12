import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { issueSession } from "../src/auth/session";
import { env } from "cloudflare:test";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, createStaff, db } from "./helpers";

/** Agrega a un usuario existente a otra organización con el rol dado y devuelve su sesión en la primera. */
async function join(orgId: string, userId: string, role: "agronomist" | "worker" | "owner") {
  const ts = Date.now();
  await db().insert(s.memberships).values({ id: newId(), organizationId: orgId, userId, role, createdAt: ts, updatedAt: ts });
}

const frost = (orgId: string, farmId: string, over: Partial<typeof s.alerts.$inferInsert> = {}) => {
  const now = Date.now();
  return {
    id: newId(),
    organizationId: orgId,
    farmId,
    kind: "frost" as const,
    severity: "warning" as const,
    validFrom: now,
    validTo: now + 86_400_000,
    summary: "Helada mañana",
    source: "t",
    dedupeKey: newId(),
    createdAt: now,
    updatedAt: now,
    ...over,
  };
};

describe("vista del agrónomo con varios clientes (K-02)", () => {
  it("junta las estancias y los avisos activos de cada organización, sin las ajenas ni las de empleado", async () => {
    const a = await createOrgWithOwner("Cliente A");
    const b = await createOrgWithOwner("Cliente B");
    const c = await createOrgWithOwner("Cliente C (empleado)");
    const ajena = await createOrgWithOwner("Ajena");
    const fa = await createFarmWithPlots(a.token, 1);
    const fb = await createFarmWithPlots(b.token, 1);
    await createFarmWithPlots(c.token, 1);
    await createFarmWithPlots(ajena.token, 1);
    const agro = await addMemberAndLogin(a.token, "agronomist", "Marta");
    await join(b.orgId, agro.userId, "agronomist");
    await join(c.orgId, agro.userId, "worker");
    await db().insert(s.alerts).values([
      frost(a.orgId, fa.farmId),
      frost(a.orgId, fa.farmId, { resolvedAt: Date.now() }),
      frost(b.orgId, fb.farmId, { validTo: Date.now() - 1000 }),
    ]);

    const r = await call<any>("GET", "/me/clients", { token: agro.token });
    expect(r.status).toBe(200);
    expect(r.body.truncated).toBe(false);
    const byName = Object.fromEntries(r.body.clients.map((x: any) => [x.organization.name, x]));
    expect(Object.keys(byName).sort()).toEqual(["Cliente A", "Cliente B"]);
    expect(byName["Cliente A"].organization.role).toBe("agronomist");
    expect(byName["Cliente A"].farms.map((f: any) => f.id)).toEqual([fa.farmId]);
    expect(byName["Cliente A"].farms[0].activeAlerts).toBe(1);
    expect(byName["Cliente A"].alerts).toHaveLength(1);
    expect(byName["Cliente A"].alerts[0]).toMatchObject({ kind: "frost", farmId: fa.farmId });
    expect(byName["Cliente B"].alerts).toEqual([]);
    expect(byName["Cliente B"].farms[0].activeAlerts).toBe(0);
    // no trae la geometría completa: la vista usa el centroide
    expect(byName["Cliente A"].farms[0].geometry).toBeUndefined();
  });

  it("el empleado de una sola organización no ve nada; sin sesión, 401", async () => {
    const o = await createOrgWithOwner();
    await createFarmWithPlots(o.token, 1);
    const worker = await addMemberAndLogin(o.token, "worker");
    expect((await call<any>("GET", "/me/clients", { token: worker.token })).body.clients).toEqual([]);
    expect((await call("GET", "/me/clients")).status).toBe(401);
  });

  it("tras cambiar de organización con /auth/switch se entra a esa estancia", async () => {
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    const fb = await createFarmWithPlots(b.token, 1);
    const agro = await addMemberAndLogin(a.token, "agronomist");
    await join(b.orgId, agro.userId, "agronomist");
    const sw = await call<any>("POST", "/auth/switch", { token: agro.token, body: { organizationId: b.orgId, deviceId: "web" } });
    expect(sw.status).toBe(200);
    const farms = await call<any[]>("GET", "/org/farms", { token: sw.body.accessToken });
    expect(farms.body.map((f) => f.id)).toEqual([fb.farmId]);
  });

  it("una sesión de soporte ve solo la organización pedida, no las otras de la misma persona", async () => {
    const staff = await createStaff();
    const a = await createOrgWithOwner("Cliente A");
    const b = await createOrgWithOwner("Otra del mismo dueño");
    await createFarmWithPlots(a.token, 1);
    await createFarmWithPlots(b.token, 1);
    await join(b.orgId, a.userId, "owner");
    const normal = await issueSession(db(), env.JWT_SECRET, a.userId, { organizationId: a.orgId });
    expect((await call<any>("GET", "/me/clients", { token: normal!.accessToken })).body.clients).toHaveLength(2);
    const sup = await call<any>("POST", `/admin/orgs/${a.orgId}/support-session`, { token: staff.token });
    const r = await call<any>("GET", "/me/clients", { token: sup.body.accessToken });
    expect(r.body.clients.map((x: any) => x.organization.name)).toEqual(["Cliente A"]);
  });
});
