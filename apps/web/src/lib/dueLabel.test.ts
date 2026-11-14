import { describe, expect, it } from "vitest";
import { dueLabel } from "./dueLabel";

describe("dueLabel", () => {
  const today = "2026-11-13";
  it("usa palabras cerca de hoy", () => {
    expect(dueLabel("2026-11-13", today)).toBe("Vence hoy");
    expect(dueLabel("2026-11-13", today, true)).toBe("Venció hoy");
    expect(dueLabel("2026-11-14", today)).toBe("Mañana");
    expect(dueLabel("2026-11-12", today, true)).toBe("Venció ayer");
    expect(dueLabel("2026-11-11", today, true)).toBe("Venció hace 2 días");
    expect(dueLabel("2026-11-16", today)).toBe("En 3 días");
  });
  it("lejos, la fecha dd/mm/aaaa (también cruzando fin de mes)", () => {
    expect(dueLabel("2026-11-20", today)).toBe("20/11/2026");
    expect(dueLabel("2026-12-01", "2026-11-30")).toBe("Mañana");
  });
});
