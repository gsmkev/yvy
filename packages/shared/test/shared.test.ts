import { describe, expect, it } from "vitest";
import { deterministicUuid, localDate, nextDueDate, nextOccurrenceId, parseRecordData, t } from "../src";

describe("tareas recurrentes", () => {
  it("próxima fecha diaria y semanal", () => {
    expect(nextDueDate("2026-11-10", "daily", "2026-11-10")).toBe("2026-11-11");
    expect(nextDueDate("2026-11-10", "daily", "2026-11-13")).toBe("2026-11-14");
    expect(nextDueDate("2026-11-10", "weekly", "2026-11-09")).toBe("2026-11-17");
    expect(nextDueDate("2026-11-10", "none", "2026-11-10")).toBeNull();
  });
  it("id determinístico con formato UUID", () => {
    const id = nextOccurrenceId("0190a000-0000-7000-8000-000000000001");
    expect(id).toBe(nextOccurrenceId("0190a000-0000-7000-8000-000000000001"));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deterministicUuid("a")).not.toBe(deterministicUuid("b"));
  });
  it("fecha local de Paraguay (UTC-3)", () => {
    expect(localDate(Date.parse("2026-11-10T02:00:00Z"))).toBe("2026-11-09");
    expect(localDate(Date.parse("2026-11-10T04:00:00Z"))).toBe("2026-11-10");
  });
});

describe("registros", () => {
  it("valida por tipo", () => {
    expect(parseRecordData("rain", { mm: 12, readAt: 1 }).success).toBe(true);
    expect(parseRecordData("pest", { pest: "chinche" }).success).toBe(false);
    expect(parseRecordData("pest", { pest: "chinche", intensity: "high" }).success).toBe(true);
    expect(parseRecordData("note", { text: "" }).success).toBe(false);
  });
});

describe("i18n", () => {
  it("interpola", () => {
    expect(t("sync.offline", { count: 3 })).toBe("SIN SEÑAL · 3 PENDIENTES");
  });
});
