import { describe, expect, it } from "vitest";
import { ndviColor } from "./vigor";

describe("ndviColor", () => {
  it("usa los extremos de la rampa y acota fuera de rango", () => {
    expect(ndviColor(0)).toBe("#B5562E");
    expect(ndviColor(0.2)).toBe("#B5562E");
    expect(ndviColor(0.9)).toBe("#3F6B35");
    expect(ndviColor(1)).toBe("#3F6B35");
  });
  it("interpola entre paradas", () => {
    expect(ndviColor(0.2 + 0.7 / 2)).toBe("#C9C46A");
  });
});
