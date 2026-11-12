import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { LIMITS } from "@yvy/shared";
import { jobOfIngestPath, jobState } from "../src/db/status";
import { hmacHex } from "../src/lib/crypto";
import { call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return { "x-yvy-timestamp": String(ts), "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`) };
};
const ingest = async (path: string, body: unknown) => {
  const raw = JSON.stringify(body);
  return call("POST", `/ingest${path}`, { body: raw, headers: await signed("POST", `/ingest${path}`, raw) });
};
const status = () => call<any>("GET", "/public/status");
const job = (r: any, id: string) => r.body.jobs.find((j: any) => j.id === id);

describe("estado del servicio (P-04)", () => {
  it("es pública y responde por el Worker, D1 y R2", async () => {
    const r = await status();
    expect(r.status).toBe(200);
    expect(r.body.services).toEqual([
      { id: "worker", ok: true },
      { id: "d1", ok: true },
      { id: "r2", ok: true },
    ]);
    expect(r.body.overall).toBe("ok");
    expect(r.body.jobs.map((j: any) => j.id)).toEqual(["sentinel2", "chirps", "firms"]);
    expect(job(r, "sentinel2")).toMatchObject({ state: "none", lastOkAt: null, lastFailAt: null });
  });

  it("no expone datos de clientes", async () => {
    const owner = await createOrgWithOwner("Estancia Secreta SA");
    await createFarmWithPlots(owner.token, 2);
    const r = await status();
    const text = JSON.stringify(r.body);
    expect(text).not.toContain("Secreta");
    expect(text).not.toContain(owner.orgId);
    expect(text).not.toContain("La Esperanza");
    expect(Object.keys(r.body).sort()).toEqual(["checkedAt", "jobs", "overall", "services"]);
  });

  it("cada pedido firmado de /ingest anota la corrida de su job; sin firma no anota nada", async () => {
    await call("POST", "/ingest/scenes", { body: "{}" });
    expect(job(await status(), "sentinel2").state).toBe("none");

    const before = Date.now();
    const ok = await ingest("/scenes", { source: "sentinel-2-l2a", itemId: "S2B_X", acquiredAt: before, cloudPct: 3 });
    expect(ok.status).toBe(200);
    const s2 = job(await status(), "sentinel2");
    expect(s2.state).toBe("ok");
    expect(s2.lastOkAt).toBeGreaterThanOrEqual(before);
    expect(job(await status(), "chirps").state).toBe("none");
  });

  it("una falla después del último éxito figura como 'falló' y un éxito posterior la limpia", async () => {
    await ingest("/fire-alerts", { nada: true }); // cuerpo inválido → 400
    let r = await status();
    expect(job(r, "firms").state).toBe("failing");
    expect(r.body.overall).toBe("degraded");
    expect(job(r, "firms").lastFailAt).toBeGreaterThan(0);

    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const good = await ingest("/fire-alerts", {
      farmId,
      date: "2026-08-15",
      severity: "watch",
      minDistanceKm: 3,
      hotspots: [{ lon: -55.85, lat: -27.25, acquiredAt: Date.now(), confidence: "h", frp: 1, source: "VIIRS_SNPP_NRT" }],
    });
    expect(good.status).toBe(200);
    r = await status();
    expect(job(r, "firms").state).toBe("ok");
    expect(r.body.overall).toBe("ok");
  });

  it("rutas de /ingest sin job de datos no cuentan", () => {
    expect(jobOfIngestPath("/ingest/scenes")).toBe("sentinel2");
    expect(jobOfIngestPath("/ingest/scenes/abc/processed")).toBe("sentinel2");
    expect(jobOfIngestPath("/ingest/plot-index-stats")).toBe("sentinel2");
    expect(jobOfIngestPath("/ingest/farms/abc/imagery-status")).toBe("sentinel2");
    expect(jobOfIngestPath("/ingest/climate-daily")).toBe("chirps");
    expect(jobOfIngestPath("/ingest/farm-spi")).toBe("chirps");
    expect(jobOfIngestPath("/ingest/fire-alerts")).toBe("firms");
    expect(jobOfIngestPath("/ingest/farms")).toBeNull();
    expect(jobOfIngestPath("/ingest/weekly-reports")).toBeNull();
  });

  it("el estado de un job sale de su última corrida y de lo que se espera de él", () => {
    const now = 1_800_000_000_000;
    const h = 3_600_000;
    expect(jobState("chirps", undefined, now)).toBe("none");
    expect(jobState("chirps", { lastOkAt: now - h, lastFailAt: null }, now)).toBe("ok");
    expect(jobState("chirps", { lastOkAt: now - (LIMITS.status.staleAfterHours.chirps + 1) * h, lastFailAt: null }, now)).toBe("late");
    expect(jobState("chirps", { lastOkAt: now - 5 * h, lastFailAt: now - h }, now)).toBe("failing");
    expect(jobState("chirps", { lastOkAt: now - h, lastFailAt: now - 5 * h }, now)).toBe("ok");
    expect(jobState("firms", { lastOkAt: null, lastFailAt: now }, now)).toBe("failing");
  });
});
