import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "@yvy/shared";
import { hmacHex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

const secrets = env as unknown as { GITHUB_DISPATCH_TOKEN?: string; GITHUB_REPO?: string };
afterEach(() => {
  vi.unstubAllGlobals();
  delete secrets.GITHUB_DISPATCH_TOKEN;
  delete secrets.GITHUB_REPO;
});

const point = (i: number, over: Record<string, unknown> = {}) => ({
  sampledOn: "2026-10-05",
  depthCm: 20,
  pointLabel: `P-${i}`,
  lon: -55.9 + i * 0.001,
  lat: -27.2,
  ph: 5 + i * 0.1,
  pMgKg: 10 + i,
  ...over,
});

describe("A-31 · mapas de fertilidad", () => {
  it("cuenta puntos con coordenadas por parámetro y el job los lee firmados", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const add = (b: Record<string, unknown>) => call("POST", `/org/farms/${farmId}/soil-samples`, { token: owner.token, body: b });
    for (let i = 0; i < 3; i++) expect((await add(point(i))).status).toBe(201);
    await add(point(9, { lon: undefined, lat: undefined, plotId: plotIds[0] })); // por lote: no cuenta
    await add(point(0, { sampledOn: "2026-11-01" })); // misma ubicación: una vez
    const f = await call<any>("GET", `/org/farms/${farmId}/fertility`, { token: owner.token });
    expect(f.body.minPoints).toBe(LIMITS.fertility.minPoints);
    expect(f.body.points).toEqual({ fert_ph: 3, fert_p: 3, fert_k: 0, fert_om: 0 });
    const path = `/ingest/farms/${farmId}/soil-points`;
    const ts = Date.now();
    const sig = await hmacHex(env.INGEST_SECRET, `${ts}.GET.${path}.`);
    const pts = await call<any[]>("GET", path, { headers: { "x-yvy-timestamp": String(ts), "x-yvy-signature": sig } });
    expect(pts.status).toBe(200);
    expect(pts.body).toHaveLength(4);
    expect(pts.body.every((p) => p.lon !== null && p.lat !== null)).toBe(true);
    expect((await call("GET", path)).status).toBe(401);
  });

  it("con menos puntos del mínimo no pide el cálculo; con suficientes lo despacha", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const add = (b: Record<string, unknown>) => call("POST", `/org/farms/${farmId}/soil-samples`, { token: owner.token, body: b });
    for (let i = 0; i < LIMITS.fertility.minPoints - 1; i++) await add(point(i));
    const few = await call("POST", `/org/farms/${farmId}/fertility-maps`, { token: owner.token, body: {} });
    expect(few.status).toBe(400);
    await add(point(LIMITS.fertility.minPoints));
    // sin GitHub configurado no se puede pedir
    expect((await call("POST", `/org/farms/${farmId}/fertility-maps`, { token: owner.token, body: {} })).status).toBe(503);
    secrets.GITHUB_DISPATCH_TOKEN = "ghp_test";
    secrets.GITHUB_REPO = "koeti/yvy";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await call("POST", `/org/farms/${farmId}/fertility-maps`, { token: owner.token, body: {} });
    expect(ok.status).toBe(202);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).inputs).toMatchObject({ job: "fertility_maps", farm: farmId });
  });

  it("el empleado no ve ni pide mapas", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect([403, 404]).toContain((await call("GET", `/org/farms/${farmId}/fertility`, { token: worker.token })).status);
    expect([403, 404]).toContain((await call("POST", `/org/farms/${farmId}/fertility-maps`, { token: worker.token, body: {} })).status);
  });
});
