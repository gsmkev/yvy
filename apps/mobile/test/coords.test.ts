import { describe, expect, it } from "vitest";
import { fixCoords, formatFix } from "../src/lib/coords";

describe("formatFix", () => {
  it("con precisión", () => {
    expect(formatFix({ lat: -25.28123, lon: -57.63456, accuracy: 8.4 })).toBe("-25.28123, -57.63456 · ± 8 m");
  });
  it("sin precisión", () => {
    expect(formatFix({ lat: -25.28123, lon: -57.63456, accuracy: null })).toBe("-25.28123, -57.63456 · sin precisión");
  });
  it("coordenadas para copiar", () => {
    expect(fixCoords({ lat: -25.281234, lon: -57.634567 })).toBe("-25.28123, -57.63457");
  });
});
