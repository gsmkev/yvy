import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, square } from "./helpers";

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
const getSigned = async (path: string) => call<any>("GET", path, { headers: await signed("GET", path) });

const burned = (plotId: string, over: Record<string, unknown> = {}) => ({
  plotId,
  kind: "burned",
  refKey: "2026-08-10",
  fromAt: 1_780_000_000_000,
  toAt: 1_781_000_000_000,
  plotAreaHa: 120,
  validPct: 96,
  metrics: { eventAt: 1_780_500_000_000, burnedHa: 14.5, highHa: 3.2, hotspots: 4 },
  changes: [
    { geometry: square(-55.895, -27.205, 0.001), areaHa: 11.3, severity: "moderate" },
    { geometry: square(-55.893, -27.205, 0.0005), areaHa: 3.2, severity: "high" },
  ],
  ...over,
});

describe("S-20 · área quemada tras un foco de fuego", () => {
  it("ingest guarda el resultado por incendio, lo reemplaza y la estancia lo muestra con el nombre del lote", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const url = `/org/farms/${farmId}/burned`;
    expect((await call<any>("GET", url, { token: owner.token })).body).toEqual({ plots: [] });

    expect((await post("/ingest/analyses", burned(plotIds[0]!))).status).toBe(200);
    expect((await post("/ingest/analyses", burned(plotIds[1]!, { metrics: { eventAt: 1, burnedHa: 0, highHa: 0, hotspots: 1 }, changes: [] }))).status).toBe(200);
    let { body } = await call<any>("GET", url, { token: owner.token });
    expect(body.plots).toHaveLength(2);
    const a = body.plots.find((p: any) => p.plotId === plotIds[0]);
    expect(a).toMatchObject({ plotName: "Lote 1", refKey: "2026-08-10", metrics: { burnedHa: 14.5, highHa: 3.2 } });
    const fc = JSON.parse(a.changes);
    expect(fc.features[1]).toMatchObject({ properties: { areaHa: 3.2, severity: "high" }, geometry: { type: "Polygon" } });

    // el mismo incendio se recalcula: reemplaza; otro incendio suma una fila
    await post("/ingest/analyses", burned(plotIds[0]!, { metrics: { eventAt: 2, burnedHa: 20, highHa: 5, hotspots: 6 } }));
    await post("/ingest/analyses", burned(plotIds[0]!, { refKey: "2026-03-01" }));
    body = (await call<any>("GET", url, { token: owner.token })).body;
    expect(body.plots).toHaveLength(3);
    expect(body.plots.filter((p: any) => p.plotId === plotIds[0] && p.refKey === "2026-08-10")[0].metrics.burnedHa).toBe(20);
  });

  it("ingest exige firma, forma válida, tipo conocido y lote existente", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    expect((await call("POST", "/ingest/analyses", { body: JSON.stringify(burned(plotIds[0]!)) })).status).toBe(401);
    expect((await post("/ingest/analyses", burned(plotIds[0]!, { kind: "otro" }))).status).toBe(400);
    expect((await post("/ingest/analyses", burned(plotIds[0]!, { metrics: { burnedHa: 1 } }))).status).toBe(400);
    expect((await post("/ingest/analyses", burned(plotIds[0]!, { metrics: { eventAt: 1, burnedHa: -1, highHa: 0, hotspots: 1 } }))).status).toBe(400);
    expect((await post("/ingest/analyses", burned(plotIds[0]!, { changes: [{ geometry: { type: "Point", coordinates: [0, 0] }, areaHa: 1 }] }))).status).toBe(400);
    expect((await post("/ingest/analyses", burned(plotIds[0]!, { validPct: 120 }))).status).toBe(400);
    expect((await post("/ingest/analyses", burned("0190f0e0-0000-7000-8000-000000000000"))).status).toBe(404);
  });

  it("los focos de la estancia salen por /ingest, recortados a su zona y a los últimos días", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const now = Date.now();
    const h = (lon: number, lat: number, acquiredAt: number, source = "VIIRS_SNPP_NRT") => ({ lon, lat, acquiredAt, confidence: "h", frp: 5, source });
    await post("/ingest/fire-alerts", {
      farmId,
      date: "2026-08-15",
      severity: "watch",
      minDistanceKm: 1,
      hotspots: [h(-55.85, -27.25, now - 2 * 86_400_000), h(-55.85, -27.25, now - 200 * 86_400_000, "MODIS_NRT"), h(-50, -20, now - 86_400_000)],
    });
    const path = `/ingest/farms/${farmId}/hotspots?days=30`;
    const res = await call<any>("GET", path, { headers: await signed("GET", `/ingest/farms/${farmId}/hotspots`) });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ lon: -55.85, lat: -27.25 });
    expect((await getSigned("/ingest/farms/0190f0e0-0000-7000-8000-000000000000/hotspots")).status).toBe(404);
    expect((await call("GET", path)).status).toBe(401);
  });

  it("permisos: dueño y agrónomo lo ven; el empleado y otra organización no", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    await post("/ingest/analyses", burned(plotIds[0]!));
    const url = `/org/farms/${farmId}/burned`;
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", url, { token: agro.token })).status).toBe(200);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", url, { token: worker.token })).status).toBe(403);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", url, { token: other.token })).status).toBe(404);
    expect((await call("GET", url)).status).toBe(401);
  });
});
