import { describe, expect, it } from "vitest";
import { sowingWindow } from "../src";

const fc = (rows: [string, number | null, number | null][]) =>
  rows.map(([date, tminC, precipMm]) => ({ date, tminC, precipMm }));

describe("ventana de siembra (A-05)", () => {
  it("marca apto cuando hay humedad, temperatura y no llueve fuerte", () => {
    const r = sowingWindow("soja", 0.6, fc([["2026-11-11", 18, 0], ["2026-11-12", 17, 2], ["2026-11-13", 16, 0]]));
    expect(r.days.every((d) => d.ok)).toBe(true);
    expect(r.best).toEqual({ from: "2026-11-11", to: "2026-11-13" });
  });

  it("bloquea por lluvia fuerte, frío, seco y encharcado", () => {
    const r = sowingWindow("soja", 0.6, fc([["2026-11-11", 18, 20], ["2026-11-12", 6, 0], ["2026-11-13", 18, 0]]));
    expect(r.days[0]!.reasons).toEqual(["rain_day"]);
    expect(r.days[1]!.reasons).toEqual(["cold"]);
    expect(r.days[2]!.ok).toBe(true);
    expect(r.best).toEqual({ from: "2026-11-13", to: "2026-11-13" });
    expect(sowingWindow("soja", 0.2, fc([["2026-11-11", 18, 0]])).days[0]!.reasons).toEqual(["dry"]);
    expect(sowingWindow("soja", 0.95, fc([["2026-11-11", 18, 0]])).days[0]!.reasons).toEqual(["saturated"]);
  });

  it("suelo justo con lluvia a la vista no bloquea; sin dato de suelo tampoco", () => {
    const r = sowingWindow("soja", 0.2, fc([["2026-11-11", 18, 0], ["2026-11-12", 18, 14], ["2026-11-13", 18, 0]]));
    expect(r.days[0]).toMatchObject({ ok: true, rainAhead: true });
    expect(sowingWindow("soja", null, fc([["2026-11-11", 18, 0]])).days[0]!.ok).toBe(true);
  });

  it("la mínima depende del cultivo y sin ventana devuelve null", () => {
    const cold = fc([["2026-06-01", 4, 0]]);
    expect(sowingWindow("trigo", 0.6, cold).days[0]!.ok).toBe(true);
    expect(sowingWindow("arroz", 0.6, cold).best).toBeNull();
  });
});
