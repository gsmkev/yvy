import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDays, DEFAULT_ALERT_SETTINGS, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runJob } from "../src/jobs";
import { evaluateDrought, evaluateExcessRain, evaluateFrost } from "../src/jobs/rules";
import type { MetResponse } from "../src/jobs/weather";
import met from "./fixtures/met-complete.json";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const day = (date: string, tminC: number, precipMm = 0) => ({
  date,
  tminC,
  tmaxC: tminC + 10,
  precipMm,
  windKmh: 10,
  windDirDeg: 0,
});

describe("reglas con umbrales configurables", () => {
  const today = "2026-06-20";
  it("helada: el umbral por defecto es 2 °C y se puede bajar o subir", () => {
    const runs = [[day(addDays(today, 1), 1)]];
    expect(evaluateFrost(runs, today)).not.toBeNull();
    expect(evaluateFrost(runs, today, 0)).toBeNull();
    expect(evaluateFrost([[day(addDays(today, 1), 4)]], today)).toBeNull();
    expect(evaluateFrost([[day(addDays(today, 1), 4)]], today, 5)).not.toBeNull();
  });

  it("lluvia: un día con el umbral de 24 h avisa; con otro umbral no", () => {
    const f = [day(today, 15, 55)];
    expect(evaluateExcessRain(f, today)).toMatchObject({
      kind: "excess_rain",
      summary: expect.stringContaining("24 h"),
    });
    expect(evaluateExcessRain(f, today, 80)).toBeNull();
    expect(evaluateExcessRain([day(today, 15, 35)], today, 30)).not.toBeNull();
  });

  it("sequía: el déficit configurable mueve el corte", () => {
    const base = { today, rain30: 60, normal30: 100, soilNow: 0.2, soilP20: 0.3, forecast: [day(today, 15, 5)] };
    expect(evaluateDrought(base)).toBeNull(); // 60 % de lo normal: no alcanza el 50 % de déficit
    expect(evaluateDrought(base, 30)).toMatchObject({ kind: "drought" }); // déficit de 30 %: sí
  });
});

describe("ajustes de avisos por estancia (C-04)", () => {
  it("devuelve los valores por defecto y guarda los del dueño", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const def = await call("GET", `/org/farms/${farmId}/alert-settings`, { token: owner.token });
    expect(def.body).toMatchObject({ ...DEFAULT_ALERT_SETTINGS, isDefault: true });
    const put = await call("PUT", `/org/farms/${farmId}/alert-settings`, {
      token: owner.token,
      body: { frostTminC: 0, excessRainMm24h: 70, droughtDeficitPct: 40 },
    });
    expect(put.status).toBe(200);
    const after = await call("GET", `/org/farms/${farmId}/alert-settings`, { token: owner.token });
    expect(after.body).toMatchObject({ frostTminC: 0, excessRainMm24h: 70, droughtDeficitPct: 40, isDefault: false });
    // segunda escritura actualiza, no duplica
    await call("PUT", `/org/farms/${farmId}/alert-settings`, {
      token: owner.token,
      body: { frostTminC: 1, excessRainMm24h: 70, droughtDeficitPct: 40 },
    });
    expect(
      await db().select().from(s.farmAlertSettings).where(eq(s.farmAlertSettings.farmId, farmId)),
    ).toHaveLength(1);
  });

  it("valida rangos", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const bad = await call("PUT", `/org/farms/${farmId}/alert-settings`, {
      token: owner.token,
      body: { frostTminC: 40, excessRainMm24h: 70, droughtDeficitPct: 40 },
    });
    expect(bad.status).toBe(400);
  });

  it("permisos: admin edita; agrónomo lee pero no edita; empleado no accede; otra organización no ve", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const body = { frostTminC: 1, excessRainMm24h: 60, droughtDeficitPct: 45 };
    const admin = await addMemberAndLogin(owner.token, "admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const worker = await addMemberAndLogin(owner.token, "worker");
    const other = await createOrgWithOwner("Otra");
    const url = `/org/farms/${farmId}/alert-settings`;
    expect((await call("PUT", url, { token: admin.token, body })).status).toBe(200);
    expect((await call("PUT", url, { token: agro.token, body })).status).toBe(403);
    expect((await call("GET", url, { token: agro.token })).status).toBe(200);
    expect((await call("GET", url, { token: worker.token })).status).toBe(403);
    expect((await call("PUT", url, { token: worker.token, body })).status).toBe(403);
    expect((await call("GET", url, { token: other.token })).status).toBe(404);
    expect((await call("PUT", url, { token: other.token, body })).status).toBe(404);
  });

  it("el job de pronóstico usa el umbral de helada de la estancia", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const now = Date.now();
    const tomorrow = addDays(localDate(now), 1);
    const forecast = structuredClone(met) as unknown as MetResponse;
    forecast.properties.timeseries.push({
      time: `${tomorrow}T09:00:00Z`,
      data: {
        instant: { details: { air_temperature: 1 } },
        next_6_hours: { details: { air_temperature_min: 1, precipitation_amount: 0 } },
      },
    });
    forecast.properties.timeseries.sort((a, b) => a.time.localeCompare(b.time));
    const fakeFetch = (async () => Response.json(forecast)) as unknown as typeof fetch;
    const deps = { fetch: fakeFetch, now: () => now };
    const frostAlerts = async () =>
      (await db().select().from(s.alerts).where(eq(s.alerts.farmId, farmId))).filter((a) => a.kind === "frost");

    await call("PUT", `/org/farms/${farmId}/alert-settings`, {
      token: owner.token,
      body: { frostTminC: -1, excessRainMm24h: 50, droughtDeficitPct: 50 },
    });
    await runJob({ type: "forecast", farmId }, env, deps);
    expect(await frostAlerts()).toHaveLength(0); // 1 °C no llega al umbral de -1 °C

    await call("PUT", `/org/farms/${farmId}/alert-settings`, {
      token: owner.token,
      body: { frostTminC: 2, excessRainMm24h: 50, droughtDeficitPct: 50 },
    });
    await runJob({ type: "forecast", farmId }, env, deps);
    expect(await frostAlerts()).toHaveLength(1);
  });
});
