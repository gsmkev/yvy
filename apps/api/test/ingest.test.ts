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

  it("detalle de estancia trae vigor, pasada previa y última visita por lote", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const day = 86_400_000;
    const now = Date.now();
    for (const [i, [at, mean]] of (
      [
        [now - 10 * day, 0.8],
        [now - 5 * day, 0.6],
      ] as const
    ).entries()) {
      const sb = JSON.stringify({
        source: "sentinel-2-l2a",
        itemId: `S2_vigor_${farmId}_${i}`,
        acquiredAt: at,
        cloudPct: 5,
      });
      const scene = await call("POST", "/ingest/scenes", {
        body: sb,
        headers: await signed("POST", "/ingest/scenes", sb),
      });
      const body = JSON.stringify({
        rows: [
          {
            plotId: plotIds[0],
            sceneId: scene.body.id,
            acquiredAt: at,
            idx: "ndvi",
            mean,
            p10: 0.1,
            p90: 0.9,
            validPct: 90,
          },
        ],
      });
      await call("POST", "/ingest/plot-index-stats", {
        body,
        headers: await signed("POST", "/ingest/plot-index-stats", body),
      });
    }
    const d = await call("GET", `/org/farms/${farmId}`, { token: owner.token });
    const a = d.body.plots.find((p: any) => p.id === plotIds[0]);
    const b = d.body.plots.find((p: any) => p.id === plotIds[1]);
    expect(a).toMatchObject({ ndviMean: 0.6, ndviPrevMean: 0.8, lastRecordAt: null });
    expect(a.ndviAt).toBeGreaterThan(a.ndviPrevAt);
    expect(b).toMatchObject({ ndviMean: null, ndviAt: null, ndviPrevMean: null, lastRecordAt: null });
  });

  it("S-11: el dato de un lote fino se guarda y se muestra como poco confiable", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 2);
    const row = (plotId: string, lowConfidence?: boolean) => ({
      plotId,
      sceneId: "s-fino",
      acquiredAt: Date.now() - 86_400_000,
      idx: "ndvi",
      mean: 0.5,
      p10: 0.4,
      p90: 0.6,
      validPct: 90,
      ...(lowConfidence === undefined ? {} : { lowConfidence }),
    });
    const body = JSON.stringify({ rows: [row(plotIds[0]!, true), row(plotIds[1]!)] });
    const r = await call("POST", "/ingest/plot-index-stats", { body, headers: await signed("POST", "/ingest/plot-index-stats", body) });
    expect(r.status).toBe(200);
    const a = await call<any>("GET", `/org/plots/${plotIds[0]}/ndvi`, { token: owner.token });
    expect(a.body.current.lowConfidence).toBe(true);
    const b = await call<any>("GET", `/org/plots/${plotIds[1]}/ndvi`, { token: owner.token });
    expect(b.body.current.lowConfidence).toBe(false);
  });
});
