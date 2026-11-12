import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, square } from "./helpers";

const secrets = env as unknown as { GITHUB_DISPATCH_TOKEN?: string; GITHUB_REPO?: string };

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return {
    "x-yvy-timestamp": String(ts),
    "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
  };
};
const post = async (path: string, payload: unknown) => {
  const body = JSON.stringify(payload);
  return call("POST", path, { body, headers: await signed("POST", path, body) });
};

const configure = () => {
  secrets.GITHUB_DISPATCH_TOKEN = "ghp_test";
  secrets.GITHUB_REPO = "koeti/yvy";
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete secrets.GITHUB_DISPATCH_TOKEN;
  delete secrets.GITHUB_REPO;
});

const cls = (forest: number, pasture: number, crop: number, other: number) => ({ forest, pasture, crop, other });
const cover = (plotId: string, over: Record<string, unknown> = {}) => ({
  plotId,
  kind: "cover_change",
  refKey: "2020-12-31_2026-10-31",
  fromAt: 1_609_000_000_000,
  toAt: 1_790_000_000_000,
  plotAreaHa: 100,
  validPct: 97,
  metrics: { from: cls(60, 30, 10, 0), to: cls(40, 45, 15, 0), forestToPasture: 15, forestToCrop: 5, forestToOther: 0 },
  changes: [{ geometry: square(-55.895, -27.205, 0.001), areaHa: 20 }],
  ...over,
});

const range = { from: "2020-12-31", to: "2026-10-31" };

describe("S-31 · cambio de cobertura entre dos fechas", () => {
  it("el dueño lo pide con dos fechas: dispara el job con las fechas y no se encola dos veces", async () => {
    const fetchMock = configure();
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const url = `/org/farms/${farmId}/cover-change`;
    expect((await call<any>("GET", url, { token: owner.token })).body).toMatchObject({ plots: [], job: { status: null } });
    fetchMock.mockClear();

    const r = await call<any>("POST", url, { token: owner.token, body: range });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ status: "processing", already: false });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main", inputs: { job: "cover_change", farm: farmId, ...range } });
    expect((await call<any>("POST", url, { token: owner.token, body: range })).body.already).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await call<any>("GET", url, { token: owner.token })).body.job).toMatchObject({ status: "processing", params: range });

    // el job termina por /ingest
    expect((await post(`/ingest/farms/${farmId}/analysis-status`, { kind: "cover_change", status: "done" })).status).toBe(200);
    expect((await call<any>("GET", url, { token: owner.token })).body.job.status).toBe("done");
    expect((await post(`/ingest/farms/0190f0e0-0000-7000-8000-000000000000/analysis-status`, { kind: "cover_change", status: "done" })).status).toBe(404);
  });

  it("valida las fechas y responde 503 sin jobs configurados dejando el pedido en failed", async () => {
    configure();
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const url = `/org/farms/${farmId}/cover-change`;
    const bad = (body: unknown) => call("POST", url, { token: owner.token, body });
    expect((await bad({ from: "2016-01-01", to: "2020-01-01" })).status).toBe(400);
    expect((await bad({ from: "2020-01-01", to: "2020-02-01" })).status).toBe(400);
    expect((await bad({ from: "2020-01-01", to: "2999-01-01" })).status).toBe(400);
    expect((await bad({ from: "ayer", to: "hoy" })).status).toBe(400);

    delete secrets.GITHUB_DISPATCH_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await bad(range)).status).toBe(503);
    expect((await call<any>("GET", url, { token: owner.token })).body.job.status).toBe("failed");
  });

  it("ingest guarda el cambio por lote y la estancia lo devuelve con las clases", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    expect((await post("/ingest/analyses", cover(plotIds[0]!))).status).toBe(200);
    expect((await post("/ingest/analyses", cover(plotIds[0]!, { metrics: { from: cls(1, 1, 1, 1) } }))).status).toBe(400); // faltan campos
    expect((await post("/ingest/analyses", cover(plotIds[0]!, { metrics: { from: cls(-1, 0, 0, 0), to: cls(0, 0, 0, 0), forestToPasture: 0, forestToCrop: 0, forestToOther: 0 } }))).status).toBe(400);
    const { body } = await call<any>("GET", `/org/farms/${farmId}/cover-change`, { token: owner.token });
    expect(body.plots).toHaveLength(1);
    expect(body.plots[0]).toMatchObject({ plotName: "Lote 1", refKey: "2020-12-31_2026-10-31", metrics: { forestToPasture: 15, to: { forest: 40 } } });
    // no se mezcla con el área quemada
    expect((await call<any>("GET", `/org/farms/${farmId}/burned`, { token: owner.token })).body.plots).toEqual([]);
  });

  it("permisos: pedirlo es del dueño y el administrador; el agrónomo lo ve; el empleado y otra organización no", async () => {
    configure();
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const admin = await addMemberAndLogin(owner.token, "admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    const other = await createOrgWithOwner("Otra");
    const url = `/org/farms/${farmId}/cover-change`;
    const req = (token: string) => call("POST", url, { token, body: range });

    expect((await req(agro.token)).status).toBe(403);
    expect((await req(worker.token)).status).toBe(403);
    expect((await req(other.token)).status).toBe(404);
    expect((await call("POST", url, { body: range })).status).toBe(401);
    expect((await req(admin.token)).status).toBe(202);
    expect((await call("GET", url, { token: agro.token })).status).toBe(200);
    expect((await call("GET", url, { token: worker.token })).status).toBe(403);
    expect((await call("GET", url, { token: other.token })).status).toBe(404);
  });
});
