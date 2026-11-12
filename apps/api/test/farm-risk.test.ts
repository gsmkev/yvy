import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

const signed = async (method: string, path: string, body = "", ts = Date.now()) => ({
  "x-yvy-timestamp": String(ts),
  "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
});

const report = (over: Record<string, unknown> = {}) => ({
  version: 1,
  generatedAt: Date.now(),
  normalFrom: 1991,
  normalTo: 2020,
  frost: {
    thresholdC: 2,
    perYear: [
      { year: 1991, days: 4 },
      { year: 1992, days: 0 },
    ],
    meanPerYear: 2,
    worst: { year: 1991, days: 4 },
    yearsWithFrostPct: 50,
    typicalFirstFrost: "06-20",
    typicalLastFrost: "08-10",
  },
  rain: {
    annualMeanMm: 1500,
    normal: [{ month: 1, meanMm: 150, p20Mm: 90, p80Mm: 200 }],
    recent: [{ month: "2026-10", mm: 120 }],
  },
  dry: { thresholdMm: 1, meanLongestDays: 18, worst: { year: 1995, days: 40 }, spells15PerYear: 0.8, summerMeanLongestDays: 14 },
  fire: {
    radiusKm: 10,
    years: 3,
    total: 5,
    perYear: [{ from: "2025-11-11", to: "2026-11-10", count: 5 }],
    byMonth: [0, 0, 0, 0, 0, 0, 1, 2, 2, 0, 0, 0],
    nearestKm: 3.4,
    lastAt: Date.now(),
    source: "NASA FIRMS VIIRS 375 m",
  },
  ...over,
});

const post = async (farmId: string, rep: unknown) => {
  const body = JSON.stringify({ farmId, report: rep });
  return call("POST", "/ingest/farm-risk", { body, headers: await signed("POST", "/ingest/farm-risk", body) });
};

describe("C-10 · informe de riesgo climático", () => {
  it("ingest guarda el informe, lo reemplaza y el dueño lo lee", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);

    const none = await call("GET", `/org/farms/${farmId}/risk`, { token: owner.token });
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ computedAt: null, report: null });

    expect((await post(farmId, report())).status).toBe(200);
    const got = await call("GET", `/org/farms/${farmId}/risk`, { token: owner.token });
    expect(got.body.report.frost.meanPerYear).toBe(2);
    expect(got.body.report.fire.total).toBe(5);
    expect(got.body.computedAt).toBeGreaterThan(0);

    await post(farmId, report({ fire: null }));
    expect((await call("GET", `/org/farms/${farmId}/risk`, { token: owner.token })).body.report.fire).toBeNull();
  });

  it("ingest exige firma, forma válida y estancia existente", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const body = JSON.stringify({ farmId, report: report() });
    expect((await call("POST", "/ingest/farm-risk", { body })).status).toBe(401);
    expect((await post(farmId, { version: 2 })).status).toBe(400);
    expect((await post("0190f0e0-0000-7000-8000-000000000000", report())).status).toBe(404);
  });

  it("/ingest/farms avisa que la estancia ya tiene informe", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const flag = async () =>
      (await call("GET", "/ingest/farms", { headers: await signed("GET", "/ingest/farms") })).body.find(
        (f: { id: string }) => f.id === farmId,
      ).hasRisk;
    expect(await flag()).toBeFalsy();
    await post(farmId, report());
    expect(await flag()).toBeTruthy();
  });

  it("permisos: agrónomo lo ve, empleado no, otra organización tampoco", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    await post(farmId, report());
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", `/org/farms/${farmId}/risk`, { token: agro.token })).status).toBe(200);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/farms/${farmId}/risk`, { token: worker.token })).status).toBe(403);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/risk`, { token: other.token })).status).toBe(404);
  });
});
