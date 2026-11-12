import { describe, expect, it } from "vitest";
import { addDays, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { dayOfYear } from "../src/db/queries";
import { call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

describe("clima de campaña completa (R-03, R-04)", () => {
  it("devuelve la climatología de más de 90 días y limita el parámetro days", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const today = localDate(Date.now());
    const dates = Array.from({ length: 200 }, (_, i) => addDays(today, -i));
    for (let i = 0; i < dates.length; i += 10) {
      await db()
        .insert(s.climateDaily)
        .values(dates.slice(i, i + 10).map((date) => ({ farmId, plotId: "", date, source: "chirps", precipMm: 1 })));
    }
    const doys = [...new Set(dates.map(dayOfYear))];
    for (let i = 0; i < doys.length; i += 10) {
      await db()
        .insert(s.climatology)
        .values(doys.slice(i, i + 10).map((d) => ({ farmId, plotId: "", dayOfYear: d, variable: "precip", mean: 2 })));
    }
    const r = await call<{ daily: unknown[]; climatology: { dayOfYear: number }[] }>(
      "GET",
      `/org/farms/${farmId}/climate?days=250`,
      { token: owner.token },
    );
    expect(r.status).toBe(200);
    expect(r.body.daily.length).toBeGreaterThanOrEqual(200);
    expect(doys.length).toBeGreaterThan(90);
    expect(r.body.climatology.length).toBe(doys.length);
    expect((await call("GET", `/org/farms/${farmId}/climate?days=99999`, { token: owner.token })).status).toBe(200);
  });
});
