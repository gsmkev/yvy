import { describe, expect, it } from "vitest";
import { bearingDeg, cardinal, distanceM, formatDistance, turnDeg } from "../src/lib/bearing";

const o = { lon: -55.9, lat: -27.2 };

describe("rumbo y distancia", () => {
  it("rumbos cardinales", () => {
    expect(bearingDeg(o, { lon: o.lon, lat: o.lat + 0.01 })).toBeCloseTo(0, 1);
    expect(bearingDeg(o, { lon: o.lon + 0.01, lat: o.lat })).toBeCloseTo(90, 0);
    expect(bearingDeg(o, { lon: o.lon, lat: o.lat - 0.01 })).toBeCloseTo(180, 1);
    expect(bearingDeg(o, { lon: o.lon - 0.01, lat: o.lat })).toBeCloseTo(270, 0);
  });
  it("distancia: 0,01° de latitud son unos 1.112 m", () => {
    const d = distanceM(o, { lon: o.lon, lat: o.lat + 0.01 });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1125);
    expect(distanceM(o, o)).toBe(0);
  });
  it("giro mínimo hacia el destino", () => {
    expect(turnDeg(10, 350)).toBe(20);
    expect(turnDeg(350, 10)).toBe(-20);
    expect(turnDeg(180, 0)).toBe(180);
  });
  it("puntos cardinales y formato", () => {
    expect(cardinal(0)).toBe("N");
    expect(cardinal(359)).toBe("N");
    expect(cardinal(225)).toBe("SO");
    expect(formatDistance(42)).toBe("42 m");
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(1234)).toContain("km");
  });
});
