import { describe, expect, it } from "vitest";
import { angleDelta, mapBearingFor, norm360, shouldRotate, smoothHeading } from "../src/lib/heading";

describe("rumbo del mapa (F-04)", () => {
  it("normaliza ángulos", () => {
    expect(norm360(-10)).toBe(350);
    expect(norm360(370)).toBe(10);
  });
  it("toma la diferencia más corta cruzando el norte", () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });
  it("suaviza sin dar la vuelta larga", () => {
    expect(smoothHeading(null, 90)).toBe(90);
    expect(smoothHeading(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(smoothHeading(0, 90, 0.5)).toBe(45);
  });
  it("no gira por cambios chicos", () => {
    expect(shouldRotate(100, 102)).toBe(false);
    expect(shouldRotate(359, 5)).toBe(true);
  });
  it("redondea el rumbo de la cámara", () => {
    expect(mapBearingFor(89.6)).toBe(90);
    expect(mapBearingFor(359.7)).toBe(0);
  });
});
