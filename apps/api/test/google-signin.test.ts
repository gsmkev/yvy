/** P-07: ingreso con Google (opcional; vincula por email verificado). */
import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { googleClaims } from "../src/routes/auth";
import { createOrgWithOwner, db } from "./helpers";
import * as s from "@yvy/shared/schema";
import { eq } from "drizzle-orm";

afterEach(() => vi.unstubAllGlobals());
const on = { ...env, GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "gsecret", APP_URL: "https://yvy.test" } as never;
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const idToken = (over: Record<string, unknown> = {}) =>
  `h.${b64({ iss: "https://accounts.google.com", aud: "cid.apps.googleusercontent.com", exp: Math.floor(Date.now() / 1000) + 600, email: "x@test.py", email_verified: true, sub: "123", ...over })}.s`;

const req = (path: string, init: RequestInit = {}, e: unknown = on) => app.request(path, init, e as never);

/** Recorre el flujo: /start (state y cookie) → /callback con lo que Google devolvería. */
async function flow(email: string, token: Record<string, unknown> = {}, tokenOk = true) {
  const start = await req("/auth/google/start");
  const url = new URL(start.headers.get("location")!);
  const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: idToken({ email, ...token }) }), { status: tokenOk ? 200 : 400 })));
  const cb = await req(`/auth/google/callback?code=abc&state=${encodeURIComponent(url.searchParams.get("state")!)}`, { headers: { cookie } });
  return { start, url, location: new URL(cb.headers.get("location")!) };
}

describe("P-07 · Google", () => {
  it("sin credenciales configuradas no existe", async () => {
    expect(await (await req("/auth/google", {}, env)).json()).toEqual({ enabled: false });
    expect((await req("/auth/google/start", {}, env)).status).toBe(404);
    expect(await (await req("/auth/google")).json()).toEqual({ enabled: true });
  });

  it("redirige a Google con el client_id y un state firmado", async () => {
    const { start, url } = await flow("nadie@test.py");
    expect(start.status).toBe(302);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cid.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://yvy.test/auth/google/callback");
  });

  it("vincula por email verificado y canjea el código una sola vez por una sesión", async () => {
    const o = await createOrgWithOwner();
    const [u] = await db().select().from(s.users).where(eq(s.users.id, o.userId));
    const { location } = await flow(u!.email!.toUpperCase());
    expect(location.pathname).toBe("/ingresar");
    const code = location.searchParams.get("google")!;
    expect(code).toBeTruthy();
    const ex = async () => req("/auth/google/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, deviceId: "web" }) });
    const first = await ex();
    expect(first.status).toBe(200);
    const session = (await first.json()) as { user: { id: string }; organization: { id: string } };
    expect(session.user.id).toBe(o.userId);
    expect(session.organization.id).toBe(o.orgId);
    expect((await ex()).status).toBe(401);
  });

  it("no crea cuentas: un email sin cuenta vuelve con error", async () => {
    const { location } = await flow("desconocido@test.py");
    expect(location.searchParams.get("google_error")).toBe("no_account");
  });

  it("rechaza email no verificado, otro client_id, state ajeno y fallo del canje", async () => {
    const o = await createOrgWithOwner();
    const [u] = await db().select().from(s.users).where(eq(s.users.id, o.userId));
    expect((await flow(u!.email!, { email_verified: false })).location.searchParams.get("google_error")).toBe("unverified");
    expect((await flow(u!.email!, { aud: "otro" })).location.searchParams.get("google_error")).toBe("unverified");
    expect((await flow(u!.email!, {}, false)).location.searchParams.get("google_error")).toBe("exchange");
    const start = await req("/auth/google/start");
    const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
    const bad = await req("/auth/google/callback?code=abc&state=falso.00", { headers: { cookie } });
    expect(new URL(bad.headers.get("location")!).searchParams.get("google_error")).toBe("state");
    const noCookie = await req("/auth/google/callback?code=abc&state=falso.00");
    expect(new URL(noCookie.headers.get("location")!).searchParams.get("google_error")).toBe("state");
  });

  it("googleClaims valida emisor, destinatario, vencimiento y verificación", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(googleClaims(idToken(), "cid.apps.googleusercontent.com", now)).toEqual({ email: "x@test.py", sub: "123" });
    expect(googleClaims(idToken({ iss: "https://evil.com" }), "cid.apps.googleusercontent.com", now)).toBeNull();
    expect(googleClaims(idToken({ exp: now - 5 }), "cid.apps.googleusercontent.com", now)).toBeNull();
    expect(googleClaims("basura", "cid.apps.googleusercontent.com", now)).toBeNull();
  });
});
