import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as s from "@yvy/shared/schema";
import { issueSession } from "../src/auth/session";
import { base32Decode, base32Encode, hotp, matchTotp, newRecoveryCode, normalizeRecoveryCode, totpStep } from "../src/lib/totp";
import { addMemberAndLogin, call, createOrgWithOwner, db } from "./helpers";

const lastCode = (spy: ReturnType<typeof vi.spyOn>) => String(spy.mock.calls.at(-1)?.[0] ?? "").match(/código es (\d{6})/)?.[1] ?? "";

/** Ingreso completo con código de email; devuelve el cuerpo tal cual (sesión o pase del segundo factor). */
async function emailLogin(email: string) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await call("POST", "/auth/email/start", { body: { email } });
  const code = lastCode(log);
  log.mockRestore();
  return call<any>("POST", "/auth/email/verify", { body: { email, code, deviceId: "web" } });
}

const currentCode = async (secret: string, offsetSteps = 0) =>
  hotp(base32Decode(secret), totpStep(Date.now()) + offsetSteps);

/** Dueño con segundo factor activado. */
async function ownerWithTotp() {
  const o = await createOrgWithOwner();
  const [u] = await db().select().from(s.users).where(eq(s.users.id, o.userId));
  const setup = await call<{ secret: string; otpauth: string }>("POST", "/auth/totp/setup", { token: o.token });
  expect(setup.status).toBe(200);
  const enable = await call<{ recoveryCodes: string[] }>("POST", "/auth/totp/enable", {
    token: o.token,
    body: { code: await currentCode(setup.body.secret) },
  });
  expect(enable.status).toBe(201);
  return { ...o, email: u!.email!, secret: setup.body.secret, recoveryCodes: enable.body.recoveryCodes };
}

describe("TOTP (RFC 6238)", () => {
  it("coincide con los vectores de prueba del RFC 6238 (SHA-1, 8 dígitos)", async () => {
    const secret = new TextEncoder().encode("12345678901234567890");
    for (const [t, code] of [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ] as const)
      expect(await hotp(secret, Math.floor(t / 30), 8)).toBe(code);
  });

  it("base32 va y vuelve, y se acepta ±1 paso de reloj pero no más", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
    const now = 1_111_111_109_000;
    expect(await matchTotp(secret, "081804", now)).toBe(Math.floor(now / 30_000));
    expect(await matchTotp(secret, "081804", now + 30_000)).toBe(Math.floor(now / 30_000));
    expect(await matchTotp(secret, "081804", now + 90_000)).toBeNull();
    expect(await matchTotp(secret, "12345", now)).toBeNull();
  });

  it("los códigos de recuperación tienen formato dictable y se normalizan", () => {
    const c = newRecoveryCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(normalizeRecoveryCode(c.toLowerCase().replace("-", " "))).toBe(c.replace("-", ""));
    expect(normalizeRecoveryCode("hola")).toBeNull();
  });
});

describe("alta, ingreso y recuperación", () => {
  it("el alta devuelve otpauth:// y no activa nada hasta confirmar con un código", async () => {
    const o = await createOrgWithOwner();
    const setup = await call<{ secret: string; otpauth: string }>("POST", "/auth/totp/setup", { token: o.token });
    expect(setup.body.otpauth).toMatch(/^otpauth:\/\/totp\/Yvy:.+\?secret=[A-Z2-7]+&issuer=Yvy&algorithm=SHA1&digits=6&period=30$/);
    expect((await call<any>("GET", "/auth/totp", { token: o.token })).body.enabled).toBe(false);
    // código errado: no se activa
    expect((await call("POST", "/auth/totp/enable", { token: o.token, body: { code: "000000" } })).status).toBe(400);
    expect((await call<any>("GET", "/auth/totp", { token: o.token })).body.enabled).toBe(false);
  });

  it("guarda el secreto cifrado y los códigos de recuperación solo como SHA-256", async () => {
    const o = await ownerWithTotp();
    const [row] = await db().select().from(s.userTotp).where(eq(s.userTotp.userId, o.userId));
    expect(row!.secretEnc).not.toContain(o.secret);
    const hashes = await db().select().from(s.totpRecoveryCodes).where(eq(s.totpRecoveryCodes.userId, o.userId));
    expect(hashes).toHaveLength(8);
    for (const h of hashes) {
      expect(h.codeHash).toMatch(/^[0-9a-f]{64}$/);
      for (const c of o.recoveryCodes) expect(h.codeHash).not.toContain(c.replace("-", ""));
    }
    expect((await call<any>("GET", "/auth/totp", { token: o.token })).body).toMatchObject({ enabled: true, recoveryLeft: 8 });
  });

  it("después del código de email pide el segundo factor y recién ahí da la sesión", async () => {
    const o = await ownerWithTotp();
    const step1 = await emailLogin(o.email);
    expect(step1.status).toBe(200);
    expect(step1.body.mfaRequired).toBe(true);
    expect(step1.body.accessToken).toBeUndefined();
    // el pase solo no sirve como sesión
    expect((await call("GET", "/sync/state", { token: step1.body.ticket })).status).toBe(401);
    expect((await call("POST", "/auth/totp/login", { body: { ticket: step1.body.ticket, code: "000000" } })).status).toBe(401);
    // el paso del reloj ya usado en el alta se rechaza (anti reuso); se acepta el siguiente
    const next = await currentCode(o.secret, 1);
    const ok = await call<any>("POST", "/auth/totp/login", { body: { ticket: step1.body.ticket, code: next } });
    expect(ok.status).toBe(200);
    expect(ok.body.organization.id).toBe(o.orgId);
    expect((await call("GET", "/sync/state", { token: ok.body.accessToken })).status).toBe(200);
    // el mismo código no se puede reusar
    expect((await call("POST", "/auth/totp/login", { body: { ticket: step1.body.ticket, code: next } })).status).toBe(401);
  });

  it("un pase adulterado o vencido no sirve", async () => {
    const o = await ownerWithTotp();
    const { ticket } = (await emailLogin(o.email)).body;
    const [payload, sig] = ticket.split(".");
    const forged = `${btoa(JSON.stringify({ userId: o.userId, exp: Date.now() + 1e9 }))}.${sig}`;
    expect((await call("POST", "/auth/totp/login", { body: { ticket: forged, code: await currentCode(o.secret, 1) } })).status).toBe(401);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    const late = await call("POST", "/auth/totp/login", { body: { ticket: `${payload}.${sig}`, code: await currentCode(o.secret) } });
    vi.useRealTimers();
    expect(late.status).toBe(401);
  });

  it("un código de recuperación entra una sola vez", async () => {
    const o = await ownerWithTotp();
    const { ticket } = (await emailLogin(o.email)).body;
    const rc = o.recoveryCodes[0]!;
    expect((await call("POST", "/auth/totp/login", { body: { ticket, code: rc.toLowerCase() } })).status).toBe(200);
    expect((await call("POST", "/auth/totp/login", { body: { ticket, code: rc } })).status).toBe(401);
    expect((await call<any>("GET", "/auth/totp", { token: o.token })).body.recoveryLeft).toBe(7);
  });

  it("bloquea tras 5 intentos fallidos, aun con el código bueno", async () => {
    const o = await ownerWithTotp();
    const { ticket } = (await emailLogin(o.email)).body;
    for (let i = 0; i < 4; i++) expect((await call("POST", "/auth/totp/login", { body: { ticket, code: "000000" } })).status).toBe(401);
    // el quinto intento fallido ya bloquea
    expect((await call("POST", "/auth/totp/login", { body: { ticket, code: "000000" } })).status).toBe(429);
    const locked = await call("POST", "/auth/totp/login", { body: { ticket, code: await currentCode(o.secret, 1) } });
    expect(locked.status).toBe(429);
  });

  it("apagarlo pide un código vigente; después el ingreso vuelve a ser solo con email", async () => {
    const o = await ownerWithTotp();
    expect((await call("POST", "/auth/totp/disable", { token: o.token, body: { code: "000000" } })).status).toBe(400);
    expect((await call("POST", "/auth/totp/disable", { token: o.token, body: { code: o.recoveryCodes[1] } })).status).toBe(200);
    const login = await emailLogin(o.email);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.mfaRequired).toBeUndefined();
  });

  it("códigos de recuperación nuevos invalidan los anteriores", async () => {
    const o = await ownerWithTotp();
    const r = await call<{ recoveryCodes: string[] }>("POST", "/auth/totp/recovery-codes", {
      token: o.token,
      body: { code: o.recoveryCodes[0] },
    });
    expect(r.status).toBe(200);
    expect(r.body.recoveryCodes).toHaveLength(8);
    const { ticket } = (await emailLogin(o.email)).body;
    expect((await call("POST", "/auth/totp/login", { body: { ticket, code: o.recoveryCodes[2] } })).status).toBe(401);
    expect((await call("POST", "/auth/totp/login", { body: { ticket, code: r.body.recoveryCodes[0] } })).status).toBe(200);
  });
});

describe("obligatorio para administradores a pedido del dueño", () => {
  it("solo el dueño fija la política y ve quién la cumple", async () => {
    const owner = await createOrgWithOwner();
    const admin = await addMemberAndLogin(owner.token, "admin", "Admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Agro");
    for (const who of [admin, agro]) {
      expect((await call("PUT", "/org/security", { token: who.token, body: { requireAdminTotp: true } })).status).toBe(403);
      expect((await call("GET", "/org/security", { token: who.token })).status).toBe(403);
    }
    expect((await call("PUT", "/org/security", { token: owner.token, body: { requireAdminTotp: true } })).status).toBe(200);
    const sec = await call<any>("GET", "/org/security", { token: owner.token });
    expect(sec.body.requireAdminTotp).toBe(true);
    expect(sec.body.admins).toEqual([{ userId: admin.userId, fullName: "Admin", totp: false }]);
  });

  it("el administrador sin segundo factor solo puede darlo de alta; con él, todo normal", async () => {
    const owner = await createOrgWithOwner();
    const admin = await addMemberAndLogin(owner.token, "admin", "Admin");
    await call("PUT", "/org/security", { token: owner.token, body: { requireAdminTotp: true } });

    const session = await issueSession(db(), env.JWT_SECRET, admin.userId);
    expect(session!.mfaSetupRequired).toBe(true);
    const t = session!.accessToken;
    const blocked = await call<any>("GET", "/sync/state", { token: t });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/segundo factor/);
    expect((await call("GET", "/auth/totp", { token: t })).body.requiredByOrg).toBe(true);

    const setup = await call<{ secret: string }>("POST", "/auth/totp/setup", { token: t });
    expect((await call("POST", "/auth/totp/enable", { token: t, body: { code: await currentCode(setup.body.secret) } })).status).toBe(201);
    // no puede apagarlo mientras la organización lo exija
    expect((await call("POST", "/auth/totp/disable", { token: t, body: { code: await currentCode(setup.body.secret, 1) } })).status).toBe(403);

    const again = await issueSession(db(), env.JWT_SECRET, admin.userId);
    expect(again!.mfaSetupRequired).toBeUndefined();
    expect((await call("GET", "/sync/state", { token: again!.accessToken })).status).toBe(200);
    const sec = await call<any>("GET", "/org/security", { token: owner.token });
    expect(sec.body.admins[0].totp).toBe(true);
  });

  it("no alcanza a dueños ni agrónomos, y el dueño puede levantar la exigencia", async () => {
    const owner = await createOrgWithOwner();
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Agro");
    await call("PUT", "/org/security", { token: owner.token, body: { requireAdminTotp: true } });
    expect((await issueSession(db(), env.JWT_SECRET, owner.userId))!.mfaSetupRequired).toBeUndefined();
    expect((await issueSession(db(), env.JWT_SECRET, agro.userId))!.mfaSetupRequired).toBeUndefined();
    const admin = await addMemberAndLogin(owner.token, "admin", "Admin");
    expect((await issueSession(db(), env.JWT_SECRET, admin.userId))!.mfaSetupRequired).toBe(true);
    await call("PUT", "/org/security", { token: owner.token, body: { requireAdminTotp: false } });
    expect((await issueSession(db(), env.JWT_SECRET, admin.userId))!.mfaSetupRequired).toBeUndefined();
  });
});
