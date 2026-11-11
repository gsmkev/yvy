import { describe, expect, it } from "vitest";
import { describeRecord, parseRecordData } from "../src";

describe("siembra (sowing)", () => {
  it("pide cultivo y, si hay densidad, su unidad", () => {
    expect(parseRecordData("sowing", { crop: "soja" }).success).toBe(true);
    expect(parseRecordData("sowing", { crop: "soja", density: 14, densityUnit: "seeds_m", areaHa: 30 }).success).toBe(true);
    expect(parseRecordData("sowing", { crop: "soja", density: 14 }).success).toBe(false);
    expect(parseRecordData("sowing", {}).success).toBe(false);
    expect(parseRecordData("sowing", { crop: "papa" }).success).toBe(false);
    expect(parseRecordData("sowing", { crop: "soja", areaHa: 0 }).success).toBe(false);
    expect(parseRecordData("sowing", { crop: "soja", seasonId: "no-es-uuid" }).success).toBe(false);
  });
  it("se describe en es-PY", () => {
    expect(describeRecord("sowing", { crop: "soja", variety: "DM 6563", density: 14, densityUnit: "seeds_m", areaHa: 30 })).toBe(
      "Soja · DM 6563 · 14 semillas por metro · 30 ha",
    );
  });
});
