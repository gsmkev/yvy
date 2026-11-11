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

  it("solo cuenta el código de quien es agrónomo: el de un dueño no identifica a nadie", async () => {
    const owner = await createOrgWithOwner();
    const r = await signup("Otro", referralCode(owner.userId));
    expect(await orgRow(r.body.organizationId)).toMatchObject({ referredBy: referralCode(owner.userId), referrerUserId: null });
  });

  it("/me/referral da el código al agrónomo y nada al dueño, al administrador ni al empleado", async () => {
    const owner = await createOrgWithOwner();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", "/me/referral", { token: agro.token })).body).toEqual({ code: referralCode(agro.userId) });
    for (const role of ["admin", "worker"] as const) {
      const m = await addMemberAndLogin(owner.token, role);
      expect((await call("GET", "/me/referral", { token: m.token })).body).toEqual({ code: null });
    }
    expect((await call("GET", "/me/referral", { token: owner.token })).body).toEqual({ code: null });
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
});
