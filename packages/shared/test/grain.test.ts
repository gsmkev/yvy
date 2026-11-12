import { describe, expect, it } from "vitest";
import { grainNet } from "../src";

const t = { grossKg: 30_000, moisturePct: 13, baseMoisturePct: 13, impuritiesPct: 0, otherKg: 0 };

describe("entregas a acopio (A-23)", () => {
  it("con humedad base y sin descuentos el neto es el bruto", () => {
    expect(grainNet(t)).toEqual({ moistureKg: 0, impuritiesKg: 0, otherKg: 0, netKg: 30_000 });
  });
  it("descuenta la merma por humedad sobre la base", () => {
    // 15 % sobre base 13 %: 30000 * 85/87 = 29310,3
    const r = grainNet({ ...t, moisturePct: 15 });
    expect(r.netKg).toBeCloseTo(29_310.3, 1);
    expect(r.moistureKg).toBeCloseTo(689.7, 1);
  });
  it("no suma peso si la humedad está bajo la base, y acepta humedad faltante", () => {
    expect(grainNet({ ...t, moisturePct: 11 }).netKg).toBe(30_000);
    expect(grainNet({ ...t, moisturePct: null }).netKg).toBe(30_000);
  });
  it("aplica impurezas y otros descuentos, sin bajar de cero", () => {
    const r = grainNet({ ...t, impuritiesPct: 1, otherKg: 100 });
    expect(r.impuritiesKg).toBe(300);
    expect(r.netKg).toBe(29_600);
    expect(grainNet({ ...t, otherKg: 99_999 }).netKg).toBe(0);
  });
});
