import { describe, expect, it } from "vitest";
import { dayToMs, fmtDateTime } from "./format";

describe("format", () => {
  it("muestra la hora en 24 h", () => {
    expect(fmtDateTime(Date.parse("2026-11-09T23:53:00Z"))).toBe("9 nov, 20:53");
    expect(fmtDateTime(Date.parse("2026-11-10T03:05:00Z"))).toBe("10 nov, 00:05");
  });
  it("dayToMs usa la zona de la estancia", () => {
    expect(dayToMs("2026-07-10", "America/Asuncion")).toBe(Date.parse("2026-07-10T00:00:00-03:00"));
    expect(dayToMs("2026-01-10", "America/Asuncion", true)).toBe(Date.parse("2026-01-10T23:59:59-03:00"));
    expect(dayToMs("2026-07-10", "America/New_York")).toBe(Date.parse("2026-07-10T00:00:00-04:00"));
    expect(dayToMs("2026-01-10", "America/New_York", true)).toBe(Date.parse("2026-01-10T23:59:59-05:00"));
    expect(dayToMs("2026-07-10", "UTC")).toBe(Date.parse("2026-07-10T00:00:00Z"));
    expect(dayToMs("2026-07-10", "Zona/Mala")).toBe(Date.parse("2026-07-10T00:00:00-03:00"));
    expect(dayToMs("", "UTC")).toBeUndefined();
  });
});
