import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { captureError, monitoringEnabled } from "../src/lib/monitoring";
import { createOrgWithOwner } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const DSN = "https://publickey@o0.ingest.sentry.io/123";
/** Un entorno con la base rota: cualquier consulta lanza y la ruta responde 500. */
const broken = (extra: object = {}) => ({ ...env, DB: undefined, ...extra }) as never;
const get = (token: string, e: never) =>
  app.request("/org/farms", { headers: { authorization: `Bearer ${token}` } }, e);
const tick = () => new Promise((r) => setTimeout(r, 50));

describe("monitoreo de errores (P-02)", () => {
  it("sin SENTRY_DSN no sale nada a la red y la respuesta sigue siendo 500", async () => {
    const owner = await createOrgWithOwner();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get(owner.token, broken());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Error interno" });
    await tick();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(monitoringEnabled({ SENTRY_DSN: "" })).toBe(false);
    expect(monitoringEnabled({ SENTRY_DSN: "   " })).toBe(false);
    expect(monitoringEnabled({})).toBe(false);
  });

  it("con DSN informa el error a Sentry, sin encabezados, tokens ni datos", async () => {
    const owner = await createOrgWithOwner();
    const sent: { url: string; body: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      sent.push({ url: String(input instanceof Request ? input.url : input), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get(owner.token, broken({ SENTRY_DSN: DSN, APP_ENV: "test" }));
    expect(res.status).toBe(500);
    await tick();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toContain("o0.ingest.sentry.io");
    expect(sent[0]!.body).not.toContain(owner.token);
    expect(sent[0]!.body.toLowerCase()).not.toContain("authorization");
  });

  it("los errores esperados (4xx) no se informan", async () => {
    const owner = await createOrgWithOwner();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const e = { ...env, SENTRY_DSN: DSN } as never;
    expect((await app.request("/org/farms", {}, e)).status).toBe(401);
    expect(
      (await app.request("/org/members", { method: "POST", headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" }, body: "{}" }, e)).status,
    ).toBe(400);
    await tick();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("captureError nunca lanza, ni con un DSN inválido", () => {
    expect(() => captureError({ SENTRY_DSN: "no-es-un-dsn", APP_ENV: "development" }, new Error("x"))).not.toThrow();
  });
});
