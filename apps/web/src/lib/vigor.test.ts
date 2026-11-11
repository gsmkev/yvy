import { describe, expect, it } from "vitest";
import { ndviColor, vigorDrop } from "./vigor";

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

describe("vigorDrop", () => {
  const base = { ndviMean: 0.5, ndviPrevMean: 0.61, ndviPrevAt: 5 };
  it("avisa solo si la caída supera el 15 %", () => {
    expect(vigorDrop(base)).toEqual({ pct: 18, since: 5 });
    expect(vigorDrop({ ...base, ndviMean: 0.55 })).toBeNull();
    expect(vigorDrop({ ...base, ndviMean: 0.7 })).toBeNull();
  });
  it("sin dos pasadas no hay aviso", () => {
    expect(vigorDrop({ ...base, ndviPrevMean: null })).toBeNull();
    expect(vigorDrop({ ...base, ndviMean: null })).toBeNull();
  });
});
