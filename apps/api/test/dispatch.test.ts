import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { call, createOrgWithOwner, square } from "./helpers";

const secrets = env as unknown as { GITHUB_DISPATCH_TOKEN?: string; GITHUB_REPO?: string };

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return {
    "x-yvy-timestamp": String(ts),
    "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
  };
};

const newFarm = (token: string) =>
  call<{ id: string }>("POST", "/org/farms", { token, body: { name: "Nueva", geometry: square(-55.9, -27.2, 0.1) } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete secrets.GITHUB_DISPATCH_TOKEN;
  delete secrets.GITHUB_REPO;
});

describe("S-02 · jobs al crear la estancia", () => {
  it("dispara new_farm en GitHub con la estancia y deja el estado en pending", async () => {
    secrets.GITHUB_DISPATCH_TOKEN = "ghp_test";
    secrets.GITHUB_REPO = "koeti/yvy";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const owner = await createOrgWithOwner();
    const farm = await newFarm(owner.token);
    expect(farm.status).toBe(201);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/koeti/yvy/actions/workflows/jobs.yml/dispatches");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghp_test");
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main", inputs: { job: "new_farm", farm: farm.body.id } });

    const detail = await call("GET", `/org/farms/${farm.body.id}`, { token: owner.token });
    expect(detail.body.imageryStatus).toBe("pending");
    expect(detail.body.imageryRequestedAt).toBeGreaterThan(0);
    const list = await call<any[]>("GET", "/org/farms", { token: owner.token });
    expect(list.body.find((f) => f.id === farm.body.id).imageryStatus).toBe("pending");
  });

  it("sin secrets (desarrollo) no llama a GitHub y la estancia se crea igual", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = await createOrgWithOwner();
    expect((await newFarm(owner.token)).status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si GitHub rechaza, la estancia queda en failed y la respuesta sigue siendo 201", async () => {
    secrets.GITHUB_DISPATCH_TOKEN = "ghp_test";
    secrets.GITHUB_REPO = "koeti/yvy";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 403 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const owner = await createOrgWithOwner();
    const farm = await newFarm(owner.token);
    expect(farm.status).toBe(201);
    const detail = await call("GET", `/org/farms/${farm.body.id}`, { token: owner.token });
    expect(detail.body.imageryStatus).toBe("failed");
  });

  it("el job avisa processing y el mapa base lo deja en ready; un job no puede poner ready a mano", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = await createOrgWithOwner();
    const farm = await newFarm(owner.token);
    const path = `/ingest/farms/${farm.body.id}/imagery-status`;

    const proc = JSON.stringify({ status: "processing" });
    expect((await call("POST", path, { body: proc, headers: await signed("POST", path, proc) })).status).toBe(200);
    expect((await call("GET", `/org/farms/${farm.body.id}`, { token: owner.token })).body.imageryStatus).toBe(
      "processing",
    );

    const ready = JSON.stringify({ status: "ready" });
    expect((await call("POST", path, { body: ready, headers: await signed("POST", path, ready) })).status).toBe(400);
    expect((await call("POST", path, { body: proc })).status).toBe(401);

    const layer = JSON.stringify({
      farmId: farm.body.id,
      layer: "true_color",
      acquiredAt: Date.now(),
      pmtilesPath: `farms/${farm.body.id}/true_color/1.pmtiles`,
      bytes: 1000,
      bounds: [-56, -27.4, -55.8, -27.2],
    });
    const added = await call("POST", "/ingest/farm-layers", {
      body: layer,
      headers: await signed("POST", "/ingest/farm-layers", layer),
    });
    expect(added.status).toBe(201);
    const list = await call<any[]>("GET", "/org/farms", { token: owner.token });
    expect(list.body.find((f) => f.id === farm.body.id).imageryStatus).toBe("ready");
  });
});

describe("S-01 · historia por lote", () => {
  it("vuelve a pedir la historia al importar los primeros lotes, no en las importaciones siguientes", async () => {
    secrets.GITHUB_DISPATCH_TOKEN = "ghp_test";
    secrets.GITHUB_REPO = "koeti/yvy";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const owner = await createOrgWithOwner();
    const farm = await newFarm(owner.token);
    const plot = (name: string, x: number) => ({ name, kind: "crop", geometry: square(x, -27.15, 0.01) });
    const path = `/org/farms/${farm.body.id}/plots`;
    expect((await call("POST", path, { token: owner.token, body: { plots: [plot("A", -55.89)] } })).status).toBe(201);
    expect((await call("POST", path, { token: owner.token, body: { plots: [plot("B", -55.87)] } })).status).toBe(201);
    // 1 al crear la estancia + 1 al importar los primeros lotes
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
