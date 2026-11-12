/** Ventanas para pulverizar desde el pronóstico horario guardado (A-13). */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { runJob } from "../src/jobs";
import { hourlyFromMet, type MetResponse } from "../src/jobs/weather";
import met from "./fixtures/met-complete.json";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const NOW = Date.parse("2026-11-10T00:30:00Z");

describe("pronóstico horario", () => {
  it("toma viento (km/h), temperatura, humedad y lluvia de cada hora", () => {
    const hours = hourlyFromMet(met as unknown as MetResponse, NOW, 48);
    expect(hours.length).toBeGreaterThan(10);
    expect(hours.length).toBeLessThanOrEqual(48);
    expect(hours[0]!.validAt).toBeGreaterThanOrEqual(Date.parse("2026-11-10T00:00:00Z"));
    for (const h of hours) {
      expect(h.windKmh).toBeGreaterThanOrEqual(0);
      expect(h.humidityPct).toBeGreaterThan(0);
      expect(h.precipMm).toBeGreaterThanOrEqual(0);
    }
    // 2,1 m/s = 7,6 km/h
    const first = (met as unknown as MetResponse).properties.timeseries[0]!;
    const same = hourlyFromMet(met as unknown as MetResponse, Date.parse(first.time), 1)[0]!;
    expect(same.windKmh).toBe(Math.round(first.data.instant.details.wind_speed! * 36) / 10);
  });

  it("respeta el horizonte pedido", () => {
    expect(hourlyFromMet(met as unknown as MetResponse, NOW, 6).length).toBeLessThanOrEqual(6);
  });
});

describe("GET /org/farms/:id/spray-windows", () => {
  const fakeFetch = (async () => Response.json(met)) as unknown as typeof fetch;

  it("el job guarda las horas y el endpoint las marca aptas o no", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await runJob({ type: "forecast", farmId }, env, { fetch: fakeFetch, now: () => NOW });
    const stored = await db().select().from(s.forecastHours).where(eq(s.forecastHours.farmId, farmId));
    expect(stored.length).toBeGreaterThan(10);

    const r = await call<{
      hours: { at: number; ok: boolean; deltaT: number | null; windKmh: number; precipMm: number }[];
      windows: { from: number; to: number }[];
      limits: { windMinKmh: number; windMaxKmh: number };
    }>("GET", `/org/farms/${farmId}/spray-windows`, { token: owner.token });
    expect(r.status).toBe(200);
    // el endpoint filtra por la hora actual real: pedirlo con datos viejos no devuelve nada que ya pasó
    expect(r.body.limits).toMatchObject({ windMinKmh: 3, windMaxKmh: 15 });
    expect(r.body.hours.every((h) => h.at >= Date.now() - 3_600_000)).toBe(true);
    for (const h of r.body.hours) {
      if (h.ok) {
        expect(h.windKmh).toBeGreaterThanOrEqual(3);
        expect(h.windKmh).toBeLessThanOrEqual(15);
        expect(h.precipMm).toBe(0);
        expect(h.deltaT).toBeGreaterThanOrEqual(2);
        expect(h.deltaT).toBeLessThanOrEqual(8);
      }
    }
  });

  it("repetir el job reemplaza las horas en vez de duplicarlas", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const deps = { fetch: fakeFetch, now: () => NOW };
    await runJob({ type: "forecast", farmId }, env, deps);
    const n = (await db().select().from(s.forecastHours).where(eq(s.forecastHours.farmId, farmId))).length;
    await runJob({ type: "forecast", farmId }, env, deps);
    expect((await db().select().from(s.forecastHours).where(eq(s.forecastHours.farmId, farmId))).length).toBe(n);
  });

  it("estancia de otra organización: 404; empleado puede ver (solo lectura)", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/spray-windows`, { token: other.token })).status).toBe(404);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/farms/${farmId}/spray-windows`, { token: worker.token })).status).toBe(200);
  });
});
