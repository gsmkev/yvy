import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDays, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runJob } from "../src/jobs";
import { evaluateRust, wetHoursByDay } from "../src/jobs/rust";
import type { HourlyForecast, MetResponse } from "../src/jobs/weather";
import { call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const hour = (iso: string, tempC: number, humidityPct: number, precipMm = 0): HourlyForecast => ({
  validAt: Date.parse(iso),
  tempC,
  windKmh: 5,
  humidityPct,
  precipMm,
});
// Asunción es UTC-3 (o -4 en verano): usar horas del mediodía UTC evita cruzar de día
const day = (date: string, n: number, tempC = 22, rh = 95) =>
  Array.from({ length: 24 }, (_, i) => hour(`${date}T${String(i).padStart(2, "0")}:00:00Z`, tempC, i < n ? rh : 60));

describe("A-40 · roya asiática", () => {
  it("cuenta horas con humedad alta o lluvia y temperatura de 15 a 28 °C", () => {
    const hours = [
      hour("2026-11-12T10:00:00Z", 22, 95), // sí
      hour("2026-11-12T11:00:00Z", 22, 70, 0.5), // lluvia: sí
      hour("2026-11-12T12:00:00Z", 22, 70), // seco: no
      hour("2026-11-12T13:00:00Z", 31, 95), // calor: no
      hour("2026-11-12T14:00:00Z", 12, 95), // frío: no
    ];
    expect(wetHoursByDay(hours, "America/Asuncion")).toEqual([{ date: "2026-11-12", wetHours: 2 }]);
  });

  it("avisa solo con soja y según las horas por día", () => {
    const watch = evaluateRust(day("2026-11-12", 9), "UTC", ["p1"]);
    expect(watch).toMatchObject({ kind: "rust_risk", severity: "watch" });
    expect(watch!.summary).toContain("roya asiática");
    expect(watch!.details.plotIds).toEqual(["p1"]);
    expect(evaluateRust(day("2026-11-12", 13), "UTC", ["p1"])).toMatchObject({ severity: "warning" });
    expect(evaluateRust(day("2026-11-12", 7), "UTC", ["p1"])).toBeNull();
    expect(evaluateRust(day("2026-11-12", 13), "UTC", [])).toBeNull();
    // dos días seguidos de 8 h suben a warning
    const two = [...day("2026-11-12", 8), ...day("2026-11-13", 8)];
    expect(evaluateRust(two, "UTC", ["p1"])).toMatchObject({ severity: "warning" });
  });

  it("el job de pronóstico crea el aviso para una estancia con soja", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1); // lotes de soja
    const now = Date.now();
    const tomorrow = addDays(localDate(now), 1);
    const steps = Array.from({ length: 24 }, (_, i) => ({
      time: `${tomorrow}T${String(i).padStart(2, "0")}:00:00Z`,
      data: {
        instant: { details: { air_temperature: 22, wind_speed: 2, relative_humidity: 96 } },
        next_1_hours: { details: { precipitation_amount: 0 } },
      },
    }));
    const met = { properties: { meta: { updated_at: new Date(now).toISOString() }, timeseries: steps } } as unknown as MetResponse;
    const fakeFetch = (async (url: string | URL | Request) => {
      if (String(url).startsWith("https://api.met.no")) return Response.json(met);
      return new Response("", { status: 404 });
    }) as typeof fetch;
    await runJob({ type: "forecast", farmId }, env, { fetch: fakeFetch, now: () => now });
    const alerts = await db().select().from(s.alerts).where(eq(s.alerts.farmId, farmId));
    const rust = alerts.filter((a) => a.kind === "rust_risk");
    expect(rust).toHaveLength(1);
    expect(rust[0]!.summary).toContain("roya");
    const list = await call<any[]>("GET", `/org/alerts?farmId=${farmId}`, { token: owner.token });
    expect(list.body.map((a) => a.kind)).toContain("rust_risk");
  });
});
