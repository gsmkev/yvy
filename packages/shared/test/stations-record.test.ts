import { describe, expect, it } from "vitest";
import { describeRecord, MONITOR_TEMPLATES, parseRecordData, summarizeStations } from "../src";

describe("estaciones en el registro de plaga", () => {
  const tpl = MONITOR_TEMPLATES.soja;
  it("el registro con estaciones valida y los viejos siguen validando", () => {
    const stations = [{ lon: -55.1, lat: -25.2, accuracyM: 6, counts: { chinche_verde: 3 } }];
    const s = summarizeStations(stations, tpl);
    expect(
      parseRecordData("pest", { pest: s.pest, intensity: s.intensity, perMeter: s.perMeter, crop: "soja", stations, averages: s.averages })
        .success,
    ).toBe(true);
    expect(parseRecordData("pest", { pest: "chinche", stations }).success).toBe(true);
    expect(parseRecordData("pest", { pest: "chinche", stations: [] }).success).toBe(false);
    expect(parseRecordData("pest", { pest: "chinche", intensity: "low" }).success).toBe(true);
  });
  it("describeRecord menciona la cantidad de estaciones", () => {
    const st = [{ counts: { roya: 1 } }, { counts: { roya: 3 } }];
    expect(describeRecord("pest", { pest: "roya", intensity: "low", stations: st })).toContain("2 estaciones");
  });
});
