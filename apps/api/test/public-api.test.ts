/** I-01: API pública de solo lectura con tokens por organización. */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as s from "@yvy/shared/schema";
import { eq } from "drizzle-orm";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";
import { push, rec } from "./records-helpers";

const makeToken = async (ownerToken: string, name = "Contabilidad") =>
  (await call<{ id: string; token: string }>("POST", "/org/api-tokens", { token: ownerToken, body: { name } })).body;
const api = (path: string, token: string, method = "GET") => call<any>(method, `/v1${path}`, { token });

describe("I-01 · tokens", () => {
  it("solo el dueño los crea; se ven una vez y en la base queda solo el hash", async () => {
    const owner = await createOrgWithOwner();
    const admin = await addMemberAndLogin(owner.token, "admin");
    expect((await call("POST", "/org/api-tokens", { token: admin.token, body: { name: "Otro" } })).status).toBe(403);
    const { id, token } = await makeToken(owner.token);
    expect(token).toMatch(/^yvy_/);
    const [row] = await db().select().from(s.apiTokens).where(eq(s.apiTokens.id, id));
    expect(row!.tokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);
    const list = await call<{ prefix: string }[]>("GET", "/org/api-tokens", { token: owner.token });
    expect(list.body[0]!.prefix).toBe(token.slice(0, 8));
    expect(JSON.stringify(list.body)).not.toContain(token);
    expect((await call("GET", "/org/api-tokens", { token: admin.token })).status).toBe(403);
  });

  it("revocar corta el acceso y hay un tope de tokens", async () => {
    const owner = await createOrgWithOwner();
    const { id, token } = await makeToken(owner.token);
    expect((await api("/farms", token)).status).toBe(200);
    expect((await call("DELETE", `/org/api-tokens/${id}`, { token: owner.token })).status).toBe(200);
    expect((await api("/farms", token)).status).toBe(401);
    for (let i = 0; i < 5; i++) expect((await call("POST", "/org/api-tokens", { token: owner.token, body: { name: `t${i}` } })).status).toBe(201);
    expect((await call("POST", "/org/api-tokens", { token: owner.token, body: { name: "sexto" } })).status).toBe(403);
  });
});

describe("I-01 · lectura", () => {
  it("devuelve estancias, lotes, registros y avisos de la organización del token, y nada más", async () => {
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    const fa = await createFarmWithPlots(a.token, 2);
    await createFarmWithPlots(b.token, 1);
    await push(a.token, [rec(fa.farmId, fa.plotIds[0]!, "rain", { mm: 12, readAt: Date.now() })]);
    const { token } = await makeToken(a.token);

    const farms = await api("/farms", token);
    expect(farms.body.data.map((f: { id: string }) => f.id)).toEqual([fa.farmId]);
    expect(farms.body.data[0].geometry.type).toBe("Polygon");
    const plots = await api(`/plots?farmId=${fa.farmId}`, token);
    expect(plots.body.data).toHaveLength(2);
    expect(plots.body.data[0]).not.toHaveProperty("organizationId");
    const recs = await api("/records?kind=rain", token);
    expect(recs.body.data).toHaveLength(1);
    expect(recs.body.data[0]).toMatchObject({ kind: "rain", data: { mm: 12 }, farmId: fa.farmId });
    expect(recs.body.nextCursor).toBeNull();
    expect((await api("/alerts?active=1", token)).body.data).toEqual([]);
    expect((await api("/records?kind=nada", token)).status).toBe(400);
  });

  it("pagina los registros con cursor", async () => {
    const o = await createOrgWithOwner();
    const f = await createFarmWithPlots(o.token, 1);
    await push(o.token, [1, 2, 3].map((n) => rec(f.farmId, null, "rain", { mm: n, readAt: Date.now() }, Date.now() - n * 1000)));
    const { token } = await makeToken(o.token);
    const p1 = await api("/records?limit=2", token);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await api(`/records?limit=2&cursor=${p1.body.nextCursor}`, token);
    expect(p2.body.data).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();
  });

  it("es de solo lectura, exige token y no acepta la sesión de la web", async () => {
    const o = await createOrgWithOwner();
    const { token } = await makeToken(o.token);
    expect((await api("/farms", token, "POST")).status).toBe(405);
    expect((await api("/farms", token, "DELETE")).status).toBe(405);
    expect((await call("GET", "/v1/farms")).status).toBe(401);
    expect((await api("/farms", "yvy_inventado")).status).toBe(401);
    expect((await api("/farms", o.token)).status).toBe(401);
  });

  afterEach(() => vi.useRealTimers());

  it("limita los pedidos por minuto", async () => {
    const o = await createOrgWithOwner();
    const { id, token } = await makeToken(o.token);
    // Reloj fijo a mitad del minuto actual: si el minuto cambiara entre insertar el contador y pedir, la ventana
    // sería otra y la prueba fallaría a veces.
    const midMinute = Math.floor(Date.now() / 60_000) * 60_000 + 30_000;
    vi.useFakeTimers({ toFake: ["Date"], now: midMinute });
    await db().insert(s.apiRate).values({ tokenId: id, window: Math.floor(Date.now() / 60_000), n: 60 }).onConflictDoNothing();
    const res = await call("GET", "/v1/farms", { token });
    expect(res.status).toBe(429);
  });
});
