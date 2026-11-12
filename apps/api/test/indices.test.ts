import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return {
    "x-yvy-timestamp": String(ts),
    "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
  };
};

const stat = (plotId: string, idx: string, mean: number, acquiredAt: number) => ({
  plotId,
  sceneId: `s-${acquiredAt}`,
  acquiredAt,
  idx,
  mean,
  p10: mean - 0.1,
  p90: mean + 0.1,
  validPct: 95,
});

const send = async (rows: unknown[]) => {
  const body = JSON.stringify({ rows });
  return call("POST", "/ingest/plot-index-stats", { body, headers: await signed("POST", "/ingest/plot-index-stats", body) });
};

describe("S-07 · otros índices (NDRE, NDMI, EVI)", () => {
  it("ingest acepta los índices nuevos, rechaza uno desconocido y no mezcla la curva de NDVI", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const day = Date.now() - 2 * 86_400_000;
    const r = await send([
      stat(plotIds[0]!, "ndvi", 0.7, day),
      stat(plotIds[0]!, "ndre", 0.4, day),
      stat(plotIds[0]!, "ndmi", 0.2, day),
      stat(plotIds[0]!, "evi", 0.5, day),
    ]);
    expect(r.status).toBe(200);
    expect((await send([stat(plotIds[0]!, "ndwi", 0.1, day)])).status).toBe(400);

    const { body } = await call<any>("GET", `/org/plots/${plotIds[0]}/ndvi`, { token: owner.token });
    expect(body.series).toHaveLength(1);
    expect(body.series[0].mean).toBe(0.7);
    expect(body.current.mean).toBe(0.7);
    expect(body.others.ndre.mean).toBe(0.4);
    expect(body.others.ndmi.mean).toBe(0.2);
    expect(body.others.evi.mean).toBe(0.5);
    expect(body.others.ndvi).toBeUndefined();
  });

  it("capas ndre/ndmi/evi: se registran por ingest y el empleado no ve los índices del lote", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const layer = { farmId, layer: "ndmi", acquiredAt: Date.now(), pmtilesPath: `farms/${farmId}/ndmi/1.pmtiles`, bytes: 1000, bounds: [-56, -27.3, -55.8, -27.1] };
    const raw = JSON.stringify(layer);
    expect((await call("POST", "/ingest/farm-layers", { body: raw, headers: await signed("POST", "/ingest/farm-layers", raw) })).status).toBe(201);
    const bad = JSON.stringify({ ...layer, layer: "ndwi" });
    expect((await call("POST", "/ingest/farm-layers", { body: bad, headers: await signed("POST", "/ingest/farm-layers", bad) })).status).toBe(400);
    const detail = await call<any>("GET", `/org/farms/${farmId}`, { token: owner.token });
    expect(detail.body.layers.some((l: any) => l.layer === "ndmi")).toBe(true);

    await send([stat(plotIds[0]!, "ndre", 0.4, Date.now() - 86_400_000)]);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/plots/${plotIds[0]}/ndvi`, { token: worker.token })).status).toBe(403);
  });
});
