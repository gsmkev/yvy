import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

const signed = async (method: string, path: string, body = "", ts = Date.now()) => ({
  "x-yvy-timestamp": String(ts),
  "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
});

describe("/ingest", () => {
  it("rechaza sin firma, con firma mala o vieja", async () => {
    expect((await call("GET", "/ingest/farms")).status).toBe(401);
    expect(
      (
        await call("GET", "/ingest/farms", {
          headers: { "x-yvy-timestamp": String(Date.now()), "x-yvy-signature": "0".repeat(64) },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call("GET", "/ingest/farms", {
          headers: await signed("GET", "/ingest/farms", "", Date.now() - 10 * 60_000),
        })
      ).status,
    ).toBe(401);
  });

  it("escena + estadísticas NDVI llegan al pull del dueño", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);

    const farms = await call("GET", "/ingest/farms", { headers: await signed("GET", "/ingest/farms") });
    expect(farms.body.map((f: any) => f.id)).toContain(farmId);

    const sceneBody = JSON.stringify({
      source: "sentinel-2-l2a",
      itemId: "S2B_21JXM_20261105",
      acquiredAt: Date.now(),
      cloudPct: 12,
    });
    const scene = await call("POST", "/ingest/scenes", {
      body: sceneBody,
      headers: await signed("POST", "/ingest/scenes", sceneBody),
    });
    expect(scene.status).toBe(200);

    const body = JSON.stringify({
      rows: plotIds.map((plotId) => ({
        plotId,
        sceneId: scene.body.id,
        acquiredAt: Date.now(),
        idx: "ndvi",
        mean: 0.71,
        p10: 0.6,
        p90: 0.8,
        validPct: 93,
      })),
    });
    const r = await call("POST", "/ingest/plot-index-stats", {
      body,
      headers: await signed("POST", "/ingest/plot-index-stats", body),
    });
    expect(r.body).toEqual({ written: 2, unknownPlots: [] });
    // reintento idempotente
    await call("POST", "/ingest/plot-index-stats", {
      body,
      headers: await signed("POST", "/ingest/plot-index-stats", body),
    });
    expect(await pullAll(owner.token, "plot_index_stats")).toHaveLength(2);
  });

  it("aviso de fuego desde FIRMS, deduplicado por día", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const hotspot = {
      lon: -55.85,
      lat: -27.25,
      acquiredAt: Date.now(),
      confidence: "h",
      frp: 12.5,
      source: "VIIRS_SNPP_NRT",
    };
    const send = async (severity: string) => {
      const body = JSON.stringify({ farmId, date: "2026-08-15", severity, minDistanceKm: 3.2, hotspots: [hotspot] });
      return call("POST", "/ingest/fire-alerts", { body, headers: await signed("POST", "/ingest/fire-alerts", body) });
    };
    expect((await send("watch")).body.notified).toBe(true);
    expect((await send("watch")).body.notified).toBe(false);
    expect((await send("warning")).body.notified).toBe(true);
    const alerts = await pullAll(owner.token, "alerts");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "fire", severity: "warning" });
  });
});
