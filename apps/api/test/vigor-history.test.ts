import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

const secrets = env as unknown as { GITHUB_DISPATCH_TOKEN?: string; GITHUB_REPO?: string };

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return {
    "x-yvy-timestamp": String(ts),
    "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
  };
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

const DAY = 86_400_000;

describe("S-03 · historia de vigor desde 2017", () => {
  it("el dueño la pide: dispara s2_history, queda procesando y no se encola dos veces", async () => {
    const fetchMock = configure();
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    expect((await call<any>("GET", `/org/farms/${farmId}/history`, { token: owner.token })).body.status).toBeNull();
    fetchMock.mockClear();

    const r = await call<any>("POST", `/org/farms/${farmId}/history`, { token: owner.token });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ status: "processing", already: false });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main", inputs: { job: "s2_history", farm: farmId } });

    const again = await call<any>("POST", `/org/farms/${farmId}/history`, { token: owner.token });
    expect(again.body.already).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await call<any>("GET", `/org/farms/${farmId}/history`, { token: owner.token })).body.status).toBe("processing");

    // el job termina por /ingest (firmado) y la estancia vuelve a poder pedirla
    const body = JSON.stringify({ status: "done" });
    const path = `/ingest/farms/${farmId}/history-status`;
    expect((await call("POST", path, { body })).status).toBe(401);
    expect((await call("POST", path, { body, headers: await signed("POST", path, body) })).status).toBe(200);
    expect((await call<any>("GET", `/org/farms/${farmId}/history`, { token: owner.token })).body.status).toBe("done");
  });

  it("sin jobs configurados responde 503 y no deja el pedido colgado", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    expect((await call("POST", `/org/farms/${farmId}/history`, { token: owner.token })).status).toBe(503);
    expect((await call<any>("GET", `/org/farms/${farmId}/history`, { token: owner.token })).body.status).toBe("failed");
    const path = `/ingest/farms/0190f0e0-0000-7000-8000-000000000000/history-status`;
    const body = JSON.stringify({ status: "done" });
    expect((await call("POST", path, { body, headers: await signed("POST", path, body) })).status).toBe(404);
  });

  it("permisos: pedirla es del dueño y el administrador; el agrónomo la ve; el empleado y otra organización no", async () => {
    configure();
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const admin = await addMemberAndLogin(owner.token, "admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    const other = await createOrgWithOwner("Otra");
    const post = (token: string) => call("POST", `/org/farms/${farmId}/history`, { token });

    expect((await post(agro.token)).status).toBe(403);
    expect((await post(worker.token)).status).toBe(403);
    expect((await post(other.token)).status).toBe(404);
    expect((await post(admin.token)).status).toBe(202);

    const get = (token: string, p: string) => call("GET", p, { token });
    expect((await get(agro.token, `/org/farms/${farmId}/history`)).status).toBe(200);
    expect((await get(agro.token, `/org/plots/${plotIds[0]}/vigor-history`)).status).toBe(200);
    expect((await get(worker.token, `/org/farms/${farmId}/history`)).status).toBe(403);
    expect((await get(worker.token, `/org/plots/${plotIds[0]}/vigor-history`)).status).toBe(403);
    expect((await get(other.token, `/org/plots/${plotIds[0]}/vigor-history`)).status).toBe(404);
    expect((await call("GET", `/org/plots/${plotIds[0]}/vigor-history`)).status).toBe(401);
  });

  it("la serie trae todas las campañas, pero el celular sigue recibiendo solo el último año", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const now = Date.now();
    const rows = [now - 5 * 365 * DAY, now - 3 * 365 * DAY, now - 10 * DAY].map((acquiredAt, i) => ({
      plotId: plotIds[0],
      sceneId: `s-${i}`,
      acquiredAt,
      idx: "ndvi",
      mean: 0.4 + i * 0.1,
      p10: 0.3,
      p90: 0.8,
      validPct: 90,
    }));
    const body = JSON.stringify({ rows });
    expect((await call("POST", "/ingest/plot-index-stats", { body, headers: await signed("POST", "/ingest/plot-index-stats", body) })).status).toBe(200);

    const { body: res } = await call<any>("GET", `/org/plots/${plotIds[0]}/vigor-history`, { token: owner.token });
    expect(res.series).toHaveLength(3);
    expect(res.series[0].acquiredAt).toBeLessThan(res.series[2].acquiredAt);
    // la curva del año y la sincronización siguen acotadas a 365 días
    expect((await call<any>("GET", `/org/plots/${plotIds[0]}/ndvi`, { token: owner.token })).body.series).toHaveLength(1);
    expect(await pullAll(owner.token, "plot_index_stats")).toHaveLength(1);
  });
});
