import { describe, expect, it } from "vitest";
import { LIMITS } from "@yvy/shared";
import { daysSince, vigorTrend } from "../src/lib/plotSheet";

const pass = (mean: number, acquiredAt = 0) => ({ mean, acquiredAt });

describe("F-23 ficha del lote", () => {
  it("sin dos pasadas no hay tendencia", () => {
    expect(vigorTrend(null, null)).toEqual({ kind: "none" });
    expect(vigorTrend(pass(0.6), null)).toEqual({ kind: "none" });
    expect(vigorTrend(pass(0.6), pass(0))).toEqual({ kind: "none" });
  });

  it("la caída se marca con el mismo umbral que la web", () => {
    const t = LIMITS.vigor.dropThresholdPct;
    const prev = pass(0.8);
    expect(vigorTrend(pass(0.8 * (1 - (t + 1) / 100)), prev).kind).toBe("down");
    expect(vigorTrend(pass(0.8 * (1 - (t - 1) / 100)), prev).kind).toBe("flat");
    expect(vigorTrend(pass(0.8 * (1 + (t + 1) / 100)), prev).kind).toBe("up");
  });

  it("cuenta días enteros desde la última visita", () => {
    const now = Date.UTC(2026, 10, 12, 12);
    expect(daysSince(now - 3_600_000, now)).toBe(0);
    expect(daysSince(now - 3 * 86_400_000 - 1000, now)).toBe(3);
    expect(daysSince(now + 5000, now)).toBe(0);
  });
});
