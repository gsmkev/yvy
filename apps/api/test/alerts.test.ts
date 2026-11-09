import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDays, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runJob, scheduled, CRONS } from "../src/jobs";
import { evaluateDrought, evaluateExcessRain, evaluateFrost, affectedPlots } from "../src/jobs/rules";
import { dailyFromMet, dailyFromPower, type MetResponse } from "../src/jobs/weather";
import met from "./fixtures/met-complete.json";
import power from "./fixtures/power.json";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, pullAll } from "./helpers";

const day = (date: string, tminC: number, precipMm = 0) => ({
  date,
  tminC,
  tmaxC: tminC + 10,
  precipMm,
  windKmh: 10,
  windDirDeg: 0,
});

describe("parseo de fuentes reales", () => {
  it("MET Norway → días locales", () => {
    const days = dailyFromMet(met as unknown as MetResponse, "America/Asuncion");
    expect(days.length).toBeGreaterThanOrEqual(9);
    for (const d of days) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.precipMm).toBeGreaterThanOrEqual(0);
    }
    const full = days.slice(1, -1);
    expect(full.every((d) => d.tminC !== null && d.tmaxC !== null && d.tminC <= d.tmaxC!)).toBe(true);
  });

  it("NASA POWER descarta -999", () => {
    const d = dailyFromPower(power as never);
    expect(d.length).toBeGreaterThan(5);
    expect(d.every((x) => x.tminC === null || x.tminC > -100)).toBe(true);
  });
});

describe("reglas", () => {
  const today = "2026-06-20";
  it("helada: probabilidad sube con corridas consistentes y margen", () => {
    const cold = [day(today, 8), day(addDays(today, 2), 1.5)];
    expect(evaluateFrost([cold], today)).toMatchObject({ severity: "watch", probability: "low" });
    expect(evaluateFrost([cold, cold, cold], today)).toMatchObject({ probability: "high" });
    const severe = [day(addDays(today, 1), -1)];
    expect(evaluateFrost([severe, severe], today)).toMatchObject({ severity: "warning", probability: "high" });
    expect(evaluateFrost([[day(addDays(today, 6), -3)]], today)).toBeNull(); // fuera de 5 días
  });

  it("exceso de lluvia", () => {
    expect(
      evaluateExcessRain([day(today, 15, 30), day(addDays(today, 1), 15, 40), day(addDays(today, 2), 15, 20)], today),
    ).toMatchObject({ kind: "excess_rain" });
    expect(evaluateExcessRain([day(today, 15, 30)], today)).toBeNull();
  });

  it("sequía exige las tres condiciones", () => {
    const base = { today, rain30: 20, normal30: 100, soilNow: 0.2, soilP20: 0.3, forecast: [day(today, 15, 5)] };
    expect(evaluateDrought(base)).toMatchObject({ kind: "drought", severity: "warning" });
    expect(evaluateDrought({ ...base, soilNow: 0.4 })).toBeNull();
    expect(evaluateDrought({ ...base, forecast: [day(today, 15, 25)] })).toBeNull();
    expect(evaluateDrought({ ...base, rain30: null })).toBeNull();
  });

  it("helada prioriza cultivos sensibles", () => {
    const ids = affectedPlots("frost", [
      { id: "potrero", kind: "pasture", crop: null },
      { id: "soja", kind: "crop", crop: "soja" },
      { id: "trigo", kind: "crop", crop: "trigo" },
    ]);
    expect(ids).toEqual(["trigo", "soja", "potrero"]);
  });
});

describe("job de pronóstico → aviso → notificación", () => {
  it("crea el aviso una vez, notifica y lo envía por push", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    await call("POST", "/devices", {
      token: worker.token,
      body: { id: "moto", platform: "android", pushToken: "ExponentPushToken[abc]" },
    });

    // MET real con una mínima forzada a -2 °C mañana
    const now = Date.now();
    const tomorrow = addDays(localDate(now), 1);
    const frosty = structuredClone(met) as unknown as MetResponse;
    frosty.properties.timeseries = frosty.properties.timeseries.map((st, i) => (i === 0 ? st : st));
    frosty.properties.timeseries.push({
      time: `${tomorrow}T09:00:00Z`,
      data: {
        instant: { details: { air_temperature: -2 } },
        next_6_hours: { details: { air_temperature_min: -2, precipitation_amount: 0 } },
      },
    });
    frosty.properties.timeseries.sort((a, b) => a.time.localeCompare(b.time));
    const calls: string[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.startsWith("https://api.met.no")) {
        expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("Yvy/1.0 koeti.com.py");
        expect(u).toMatch(/lat=-?\d+\.\d{1,4}&lon=-?\d+\.\d{1,4}$/);
        return Response.json(frosty);
      }
      if (u.startsWith("https://exp.host")) return Response.json({ data: [] });
      throw new Error(`fetch inesperado ${u}`);
    }) as typeof fetch;
    const deps = { fetch: fakeFetch, now: () => now };

    await runJob({ type: "forecast", farmId }, env, deps);
    await runJob({ type: "forecast", farmId }, env, deps); // misma corrida: no duplica
    const alerts = await db().select().from(s.alerts).where(eq(s.alerts.farmId, farmId));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "frost", severity: "warning", source: "MET Norway" });

    const notifs = await db().select().from(s.notifications);
    const forWorker = notifs.filter((n) => n.userId === worker.userId);
    expect(forWorker.map((n) => n.channel)).toEqual(["push"]); // empleado: solo push
    expect(
      notifs
        .filter((n) => n.userId === owner.userId)
        .map((n) => n.channel)
        .sort(),
    ).toEqual(["email", "push"]);

    await scheduled({ cron: CRONS.notify }, env, deps);
    expect(calls.filter((c) => c.startsWith("https://exp.host"))).toHaveLength(1);
    const after = await db().select().from(s.notifications);
    expect(after.every((n) => n.status === "sent")).toBe(true);

    // el aviso baja por sync al empleado (su lote está afectado)
    expect(await pullAll(worker.token, "alerts")).toHaveLength(1);
    const feedback = await call("POST", `/org/alerts/${alerts[0]!.id}/feedback`, {
      token: owner.token,
      body: { useful: true },
    });
    expect(feedback.status).toBe(200);
    expect((await call("GET", "/org/alerts?active=1", { token: owner.token })).body[0].useful).toBe(true);
  });
});
