import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId, parseReferralCode, referralCode } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createOrgWithOwner, createStaff, db } from "./helpers";

const signup = (name: string, ref?: unknown) =>
  call<any>("POST", "/auth/signup", {
    body: { organizationName: name, fullName: "Ana", email: `${newId()}@referido.test`, ...(ref === undefined ? {} : { ref }) },
  });

const orgRow = async (id: string) => (await db().select().from(s.organizations).where(eq(s.organizations.id, id)).limit(1))[0]!;

describe("V-05 · programa para agrónomos", () => {
  it("el código sale del id del usuario: 8 caracteres hexadecimales en mayúsculas", () => {
    const id = "0190f0e0-1234-7abc-8def-0123456789ab";
    expect(referralCode(id)).toBe("456789AB");
    expect(parseReferralCode(" 456789ab ")).toBe("456789AB");
    expect(parseReferralCode("456789A")).toBeNull();
    expect(parseReferralCode("ZZZZZZZZ")).toBeNull();
    expect(parseReferralCode(42)).toBeNull();
  });

  it("el registro con ref de un agrónomo queda anotado en la organización nueva", async () => {
    const owner = await createOrgWithOwner();
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing. Villalba");
    const code = referralCode(agro.userId);
    const res = await signup("Estancia Referida", code.toLowerCase());
    expect(res.status).toBe(201);
    expect(await orgRow(res.body.organizationId)).toMatchObject({ referredBy: code, referrerUserId: agro.userId });
  });

  it("un código con forma válida pero sin dueño se guarda sin agrónomo; uno inválido o ausente se ignora", async () => {
    const unknown = await signup("Sin Dueño", "ABCDEF01");
    expect(await orgRow(unknown.body.organizationId)).toMatchObject({ referredBy: "ABCDEF01", referrerUserId: null });
    for (const bad of ["xx", "'; DROP TABLE--", 123, undefined]) {
      const r = await signup("Sin Referido", bad);
      expect(r.status).toBe(201);
      expect(await orgRow(r.body.organizationId)).toMatchObject({ referredBy: null, referrerUserId: null });
    }
  });

  it("V-06: el código de un productor (dueño) también identifica a quien refirió; el de un administrador o empleado no", async () => {
    const owner = await createOrgWithOwner();
    const r = await signup("Otro", referralCode(owner.userId));
    expect(await orgRow(r.body.organizationId)).toMatchObject({ referredBy: referralCode(owner.userId), referrerUserId: owner.userId });
    const admin = await addMemberAndLogin(owner.token, "admin");
    const r2 = await signup("Otro 2", referralCode(admin.userId));
    expect(await orgRow(r2.body.organizationId)).toMatchObject({ referredBy: referralCode(admin.userId), referrerUserId: null });
  });

  it("/me/referral da el código al agrónomo y al productor (dueño), y nada al administrador ni al empleado", async () => {
    const owner = await createOrgWithOwner();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", "/me/referral", { token: agro.token })).body).toEqual({ code: referralCode(agro.userId), referred: 0, credited: 0 });
    for (const role of ["admin", "worker"] as const) {
      const m = await addMemberAndLogin(owner.token, role);
      expect((await call("GET", "/me/referral", { token: m.token })).body).toEqual({ code: null, referred: 0, credited: 0 });
    }
    expect((await call("GET", "/me/referral", { token: owner.token })).body).toEqual({ code: referralCode(owner.userId), referred: 0, credited: 0 });
    expect((await call("GET", "/me/referral")).status).toBe(401);
  });

  it("el panel interno muestra el código y el agrónomo; los clientes no lo ven", async () => {
    const owner = await createOrgWithOwner();
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing. Villalba");
    const code = referralCode(agro.userId);
    const res = await signup("Estancia del Panel", code);
    const staff = await createStaff();
    const m = await call<any>("GET", "/admin/metrics?q=Estancia del Panel", { token: staff.token });
    expect(m.status).toBe(200);
    expect(m.body.organizations[0]).toMatchObject({ id: res.body.organizationId, referredBy: code, referrerName: "Ing. Villalba" });
    expect((await call("GET", "/admin/metrics", { token: agro.token })).status).toBe(403);
    expect((await call("GET", "/org/dashboard", { token: owner.token })).body).not.toHaveProperty("referredBy");
  });

  it("V-06: el crédito del referido se anota desde el panel interno y el productor ve cuántos llegaron", async () => {
    const owner = await createOrgWithOwner();
    const res = await signup("Vecino", referralCode(owner.userId));
    const orgId = res.body.organizationId;
    const staff = await createStaff();
    const credit = (credited: boolean, token = staff.token, id = orgId) => call<any>("POST", `/admin/orgs/${id}/referral-credit`, { token, body: { credited } });
    expect((await call("GET", "/me/referral", { token: owner.token })).body).toMatchObject({ referred: 1, credited: 0 });
    expect((await credit(true, owner.token)).status).toBe(403);
    expect((await credit(true)).status).toBe(200);
    expect(await orgRow(orgId)).toMatchObject({ referralCreditedAt: expect.any(Number) });
    const m = await call<any>("GET", "/admin/metrics?q=Vecino", { token: staff.token });
    expect(m.body.organizations[0]).toMatchObject({ referrerUserId: owner.userId, referralCreditedAt: expect.any(Number) });
    expect((await call("GET", "/me/referral", { token: owner.token })).body).toMatchObject({ referred: 1, credited: 1 });
    const log = await call<{ action: string }[]>("GET", `/admin/audit?orgId=${orgId}`, { token: staff.token });
    expect(log.body.map((r) => r.action)).toContain("referral_credit");
    expect((await credit(false)).status).toBe(200);
    expect(await orgRow(orgId)).toMatchObject({ referralCreditedAt: null });
    // sin referidor no hay crédito que anotar
    const alone = await signup("Solo");
    expect((await credit(true, staff.token, alone.body.organizationId)).status).toBe(400);
  });
});
