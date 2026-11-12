import { describe, expect, it } from "vitest";
import { isStaleVisit, stalePlots, staleDaysOrDefault } from "../src";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 12);

describe("lotes sin visitar (T-07)", () => {
  it("nunca visitado o más viejo que N días", () => {
    expect(isStaleVisit(null, 7, now)).toBe(true);
    expect(isStaleVisit(now - 8 * DAY, 7, now)).toBe(true);
    expect(isStaleVisit(now - 7 * DAY, 7, now)).toBe(false);
    expect(isStaleVisit(now - 8 * DAY, 14, now)).toBe(false);
  });
  it("filtra la lista según N", () => {
    const plots = [
      { id: "a", lastRecordAt: now - 2 * DAY },
      { id: "b", lastRecordAt: now - 10 * DAY },
      { id: "c", lastRecordAt: null },
    ];
    expect(stalePlots(plots, 3, now).map((p) => p.id)).toEqual(["b", "c"]);
    expect(stalePlots(plots, 14, now).map((p) => p.id)).toEqual(["c"]);
  });
  it("N inválido vuelve al valor por defecto", () => {
    expect(staleDaysOrDefault(14)).toBe(14);
    expect(staleDaysOrDefault(5)).toBe(7);
    expect(staleDaysOrDefault(undefined)).toBe(7);
  });
});
