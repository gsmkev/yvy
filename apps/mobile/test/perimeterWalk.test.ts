import { describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({}));

import { traceToPolygon } from "@yvy/geo";
import { appendFix, traceLengthM } from "../src/lib/perimeterWalk";

describe("M-04 · perímetro caminado", () => {
  it("la traza solo suma fijos buenos y que avanzaron, y mide lo recorrido", () => {
    let trace = appendFix([], { lon: -55.9, lat: -27.2, accuracy: 5 });
    trace = appendFix(trace, { lon: -55.9, lat: -27.2000001, accuracy: 5 }); // quieto
    trace = appendFix(trace, { lon: -55.9, lat: -27.2005, accuracy: 80 }); // impreciso
    expect(trace).toHaveLength(1);
    trace = appendFix(trace, { lon: -55.9, lat: -27.201, accuracy: 6 }); // ~111 m al sur
    expect(trace).toHaveLength(2);
    expect(traceLengthM(trace)).toBeGreaterThan(105);
    expect(traceLengthM(trace)).toBeLessThan(118);
    expect(traceLengthM([])).toBe(0);
  });

  it("un recorrido cuadrado se cierra en un lote válido de la superficie esperada", () => {
    const d = 0.001; // ~110 m
    const walk = [
      [0, 0], [d / 2, 0], [d, 0], [d, -d / 2], [d, -d], [d / 2, -d], [0, -d], [0, -d / 2],
    ].map(([x, y]) => ({ lon: -55.9 + x!, lat: -27.2 + y!, accuracy: 4 }));
    const r = traceToPolygon(walk);
    expect("polygon" in r).toBe(true);
    if ("polygon" in r) {
      expect(r.polygon.coordinates[0]).toHaveLength(5); // las esquinas + el cierre
      expect(r.ha).toBeGreaterThan(1.0);
      expect(r.ha).toBeLessThan(1.4);
    }
  });
});
