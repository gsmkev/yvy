import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { call } from "./helpers";
import { createOrgWithOwner, addMemberAndLogin } from "./helpers";

const lastCode = (spy: ReturnType<typeof vi.spyOn>) => {
  const msg = String(spy.mock.calls.at(-1)?.[0] ?? "");
  return msg.match(/código es (\d{6})/)?.[1] ?? "";
};

describe("auth por código de email", () => {
  it("signup → código → sesión → refresh rotado", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const email = "duena@estancia.py";
    expect(
      (await call("POST", "/auth/signup", { body: { organizationName: "Agro Sur", fullName: "Ana", email } })).status,
    ).toBe(201);
    expect((await call("POST", "/auth/email/start", { body: { email } })).status).toBe(200);
    const code = lastCode(log);
    expect(code).toMatch(/^\d{6}$/);

    const bad = await call("POST", "/auth/email/verify", {
      body: { email, code: code === "000000" ? "111111" : "000000" },
    });
    expect(bad.status).toBe(401);
    const ok = await call("POST", "/auth/email/verify", { body: { email, code, deviceId: "web" } });
    expect(ok.status).toBe(200);
    expect(ok.body.organization.role).toBe("owner");
    // código de un solo uso
    expect((await call("POST", "/auth/email/verify", { body: { email, code } })).status).toBe(401);

    const state = await call("GET", "/sync/state", { token: ok.body.accessToken });
    expect(state.status).toBe(200);

    const r1 = await call("POST", "/auth/refresh", { body: { refreshToken: ok.body.refreshToken } });
    expect(r1.status).toBe(200);
    // el refresh viejo ya no sirve
    expect((await call("POST", "/auth/refresh", { body: { refreshToken: ok.body.refreshToken } })).status).toBe(401);
    log.mockRestore();
  });

  it("bloquea tras 5 intentos fallidos", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const email = "x@estancia.py";
    await call("POST", "/auth/signup", { body: { organizationName: "Org X", fullName: "Xavier", email } });
    await call("POST", "/auth/email/start", { body: { email } });
    const code = lastCode(log);
    const wrong = code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++)
      expect((await call("POST", "/auth/email/verify", { body: { email, code: wrong } })).status).toBe(401);
    expect((await call("POST", "/auth/email/verify", { body: { email, code } })).status).toBe(429);
    log.mockRestore();
  });

  it("email desconocido responde igual (no revela cuentas)", async () => {
    expect((await call("POST", "/auth/email/start", { body: { email: "nadie@x.py" } })).body).toEqual({ ok: true });
  });

  it("QR de vinculación: un solo uso, solo dueño/admin", async () => {
    const owner = await createOrgWithOwner();
    const worker = await addMemberAndLogin(owner.token, "worker");
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Agrónomo");

    expect((await call("POST", "/auth/link", { token: agro.token, body: { userId: worker.userId } })).status).toBe(403);
    const link = await call("POST", "/auth/link", { token: owner.token, body: { userId: worker.userId } });
    expect(link.status).toBe(201);
    expect(link.body.qr).toMatch(/^yvy:\/\/link\?c=/);

    const s1 = await call("POST", "/auth/link/redeem", { body: { code: link.body.code, deviceId: "moto-e" } });
    expect(s1.status).toBe(200);
    expect(s1.body.organization.role).toBe("worker");
    expect((await call("POST", "/auth/link/redeem", { body: { code: link.body.code } })).status).toBe(401);
  });

  it("rechaza tokens inválidos", async () => {
    expect((await call("GET", "/sync/state", { token: "x.y.z" })).status).toBe(401);
    expect((await call("GET", "/sync/state")).status).toBe(401);
    expect(env.JWT_SECRET).toBeTruthy();
  });

  it("las pantallas de la web no exigen sesión; la API sí", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("GET", "/org/farms")).status).toBe(401);
    const page = await call("GET", "/ingresar").catch(() => ({ status: 0 }));
    expect(page.status).not.toBe(401);
  });
});
