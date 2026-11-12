import { describe, expect, it } from "vitest";
import { farmSpiSchema, spiCategory } from "../src";

describe("SPI (C-07)", () => {
  it("categorías de McKee", () => {
    expect(spiCategory(-2.3)).toBe("extreme_drought");
    expect(spiCategory(-1.5)).toBe("severe_drought");
    expect(spiCategory(-1.2)).toBe("moderate_drought");
    expect(spiCategory(0)).toBe("normal");
    expect(spiCategory(0.99)).toBe("normal");
    expect(spiCategory(1.2)).toBe("moderate_wet");
    expect(spiCategory(1.8)).toBe("very_wet");
    expect(spiCategory(2)).toBe("extreme_wet");
  });
  it("valida el informe", () => {
    const ok = {
      version: 1,
      generatedAt: 1,
      throughMonth: "2026-10",
      referenceFrom: 1991,
      referenceTo: 2020,
      scales: [{ scale: 3, spi: -1.2, mm: 210, normalMm: 330, reason: null }],
    };
    expect(farmSpiSchema.safeParse(ok).success).toBe(true);
    expect(farmSpiSchema.safeParse({ ...ok, scales: [{ ...ok.scales[0], scale: 2 }] }).success).toBe(false);
    expect(farmSpiSchema.safeParse({ ...ok, scales: [{ ...ok.scales[0], spi: 9 }] }).success).toBe(false);
  });
});
