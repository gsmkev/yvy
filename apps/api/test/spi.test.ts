import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { isoDay, seedClimate } from "./agri2-helpers";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return { "x-yvy-timestamp": String(ts), "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`) };
};

const report = {
  version: 1,
  generatedAt: Date.now(),
  throughMonth: "2026-10",
  referenceFrom: 1991,
  referenceTo: 2020,
  scales: [
    { scale: 1, spi: -0.4, mm: 80, normalMm: 110, reason: null },
    { scale: 3, spi: -1.3, mm: 210, normalMm: 330, reason: null },
    { scale: 6, spi: null, mm: null, normalMm: 640, reason: "chirps_incomplete" },
  ],
};

describe("C-07 · SPI a 1, 3 y 6 meses", () => {
  it("el job lo guarda firmado y el dueño lo lee", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    expect((await call("GET", `/org/farms/${farmId}/spi`, { token: owner.token })).body).toEqual({ computedAt: null, report: null });
    const body = JSON.stringify({ farmId, report });
    expect((await call("POST", "/ingest/farm-spi", { body, headers: await signed("POST", "/ingest/farm-spi", body) })).status).toBe(200);
    const r = await call<any>("GET", `/org/farms/${farmId}/spi`, { token: owner.token });
    expect(r.body.report.scales).toHaveLength(3);
    expect(r.body.report.scales[1]).toMatchObject({ scale: 3, spi: -1.3 });
    // reemplaza el anterior
    const body2 = JSON.stringify({ farmId, report: { ...report, throughMonth: "2026-11" } });
    await call("POST", "/ingest/farm-spi", { body: body2, headers: await signed("POST", "/ingest/farm-spi", body2) });
    expect((await call<any>("GET", `/org/farms/${farmId}/spi`, { token: owner.token })).body.report.throughMonth).toBe("2026-11");
  });

  it("rechaza sin firma, un informe mal formado y una estancia inexistente", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    expect((await call("POST", "/ingest/farm-spi", { body: JSON.stringify({ farmId, report }) })).status).toBe(401);
    const bad = JSON.stringify({ farmId, report: { ...report, scales: [{ scale: 2, spi: 0, mm: 1, normalMm: 1, reason: null }] } });
    expect((await call("POST", "/ingest/farm-spi", { body: bad, headers: await signed("POST", "/ingest/farm-spi", bad) })).status).toBe(400);
    const missing = JSON.stringify({ farmId: "01a1cbc6-c1c7-7ad1-86f6-e16e35f262f7", report });
    expect((await call("POST", "/ingest/farm-spi", { body: missing, headers: await signed("POST", "/ingest/farm-spi", missing) })).status).toBe(404);
  });

  it("el job baja la lluvia CHIRPS diaria (la final pisa a la preliminar)", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const d1 = isoDay(Date.now() - 3 * 86_400_000);
    const d2 = isoDay(Date.now() - 2 * 86_400_000);
    await seedClimate(farmId, [
      { date: d1, source: "chirps_prelim", precipMm: 5 },
      { date: d1, source: "chirps", precipMm: 7 },
      { date: d2, source: "chirps_prelim", precipMm: 3 },
      { date: d2, source: "nasa_power", tminC: 10 },
    ]);
    const path = `/ingest/farms/${farmId}/precip`;
    const r = await call<any[]>("GET", `${path}?from=${d1}`, { headers: await signed("GET", path) });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ date: d1, mm: 7 }, { date: d2, mm: 3 }]);
  });

  it("el empleado no lo ve; otra organización tampoco", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/farms/${farmId}/spi`, { token: worker.token })).status).toBe(403);
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing.");
    expect((await call("GET", `/org/farms/${farmId}/spi`, { token: agro.token })).status).toBe(200);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/spi`, { token: other.token })).status).toBe(404);
  });
});
