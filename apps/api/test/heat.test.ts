/** G-32: índice de estrés térmico del ganado (THI) con MET Norway y aviso `heat_stress`. */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { heatLevel, thi } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runJob } from "../src/jobs";
import { evaluateHeatStress } from "../src/jobs/heat";
import type { MetResponse } from "../src/jobs/weather";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 11, 15, 0, 0);
const hours = (n: number, tempC: number, humidityPct: number, start = NOW) =>
  Array.from({ length: n }, (_, i) => ({ validAt: start + i * HOUR, tempC, humidityPct }));

describe("THI (puro)", () => {
  it("fórmula de Mader y niveles", () => {
    expect(thi(30, 50)).toBeCloseTo(0.8 * 30 + 0.5 * (30 - 14.4) + 46.4, 6);
    expect(heatLevel(74.9)).toBe("normal");
    expect(heatLevel(75)).toBe("alert");
    expect(heatLevel(79)).toBe("danger");
    expect(heatLevel(84)).toBe("emergency");
    expect(thi(36, 60)).toBeGreaterThan(84);
    expect(thi(20, 50)).toBeLessThan(75);
  });
});

describe("evaluateHeatStress (puro)", () => {
  it("sin horas calurosas no hay aviso", () => {
    expect(evaluateHeatStress(hours(48, 22, 50), NOW, "America/Asuncion")).toBeNull();
  });
  it("tres horas en peligro: vigilancia; dos en emergencia: advertencia", () => {
    const base = hours(48, 22, 50);
    const danger = base.map((h, i) => (i >= 4 && i < 7 ? { ...h, tempC: 33, humidityPct: 50 } : h)); // THI ~ 81
    expect(evaluateHeatStress(danger, NOW, "America/Asuncion")).toMatchObject({ kind: "heat_stress", severity: "watch" });
    const two = base.map((h, i) => (i >= 4 && i < 6 ? { ...h, tempC: 36, humidityPct: 60 } : h));
    expect(evaluateHeatStress(two, NOW, "America/Asuncion")).toMatchObject({ severity: "warning" });
    const brief = base.map((h, i) => (i === 4 || i === 5 ? { ...h, tempC: 33, humidityPct: 50 } : h));
    expect(evaluateHeatStress(brief, NOW, "America/Asuncion")).toBeNull(); // solo 2 horas en peligro
  });
  it("ignora horas fuera de las próximas 48 h y sin humedad", () => {
    const far = hours(10, 36, 60, NOW + 60 * HOUR);
    expect(evaluateHeatStress(far, NOW, "America/Asuncion")).toBeNull();
    const nulls = hours(48, 36, 60).map((h) => ({ ...h, humidityPct: null }));
    expect(evaluateHeatStress(nulls, NOW, "America/Asuncion")).toBeNull();
  });
});

describe("GET /org/farms/:id/heat-stress", () => {
  it("devuelve el THI por hora y respeta organización y lotes asignados", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const now = Date.now();
    const start = now - (now % HOUR);
    await db()
      .insert(s.forecastHours)
      .values(
        Array.from({ length: 6 }, (_, i) => ({
          farmId,
          validAt: start + i * HOUR,
          tempC: 36,
          windKmh: 5,
          humidityPct: 60,
          precipMm: 0,
        })),
      );
    const res = await call("GET", `/org/farms/${farmId}/heat-stress`, { token: owner.token });
    expect(res.status).toBe(200);
    expect(res.body.hours).toHaveLength(6);
    expect(res.body.hours[0]).toMatchObject({ level: "emergency" });
    expect(res.body.summary).toMatchObject({ maxLevel: "emergency", dangerHours: 6, emergencyHours: 6 });
    expect(res.body.thresholds).toEqual({ alert: 75, danger: 79, emergency: 84 });

    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/farms/${farmId}/heat-stress`, { token: worker.token })).status).toBe(404);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    expect((await call("GET", `/org/farms/${farmId}/heat-stress`, { token: worker.token })).status).toBe(200);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/heat-stress`, { token: other.token })).status).toBe(404);
  });

  it("sin pronóstico horario devuelve vacío", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const res = await call("GET", `/org/farms/${farmId}/heat-stress`, { token: owner.token });
    expect(res.body.hours).toEqual([]);
    expect(res.body.summary.maxLevel).toBe("normal");
  });
});

describe("job de pronóstico → aviso heat_stress", () => {
  const hotMet = (now: number): MetResponse => ({
    properties: {
      meta: { updated_at: new Date(now).toISOString() },
      timeseries: Array.from({ length: 50 }, (_, i) => ({
        time: new Date(now - (now % HOUR) + i * HOUR).toISOString(),
        data: {
          instant: { details: { air_temperature: 36, relative_humidity: 60, wind_speed: 2 } },
          next_1_hours: { details: { precipitation_amount: 0 } },
        },
      })),
    },
  });
  const run = async (farmId: string, now: number) => {
    const fakeFetch = (async (url: string | URL | Request) => {
      if (String(url).startsWith("https://api.met.no")) return Response.json(hotMet(now));
      if (String(url).startsWith("https://exp.host")) return Response.json({ data: [] });
      throw new Error(`fetch inesperado ${String(url)}`);
    }) as typeof fetch;
    await runJob({ type: "forecast", farmId }, env, { fetch: fakeFetch, now: () => now });
  };
  const heatAlerts = (farmId: string) =>
    db()
      .select()
      .from(s.alerts)
      .where(and(eq(s.alerts.farmId, farmId), eq(s.alerts.kind, "heat_stress")));

  it("crea el aviso sobre los potreros, una sola vez", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    await call("PATCH", `/org/plots/${plotIds[0]}`, { token: owner.token, body: { kind: "pasture" } });
    const now = Date.now();
    await run(farmId, now);
    await run(farmId, now);
    const alerts = await heatAlerts(farmId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "warning", source: "MET Norway" });
    expect(JSON.parse(alerts[0]!.plotIds)).toEqual([plotIds[0]]);
  });

  it("una estancia sin potreros no recibe el aviso", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await run(farmId, Date.now());
    expect(await heatAlerts(farmId)).toHaveLength(0);
  });
});
