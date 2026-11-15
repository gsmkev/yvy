import { describe, expect, it } from "vitest";
import { dueLabel, tasksByDay, weekDays, weekStart } from "../src/office/calendar";

describe("calendario", () => {
  it("lunes de la semana", () => {
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // domingo
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekDays("2026-11-09")).toHaveLength(7);
  });
  it("agrupa por día, sin canceladas, con hora primero", () => {
    const days = weekDays("2026-11-09");
    const m = tasksByDay(
      [
        { dueDate: "2026-11-10", dueTime: null, status: "open", priority: "normal", id: "a" },
        { dueDate: "2026-11-10", dueTime: "08:00", status: "open", priority: "low", id: "b" },
        { dueDate: "2026-11-10", dueTime: null, status: "cancelled", priority: "normal", id: "c" },
        { dueDate: "2026-12-01", dueTime: null, status: "open", priority: "normal", id: "d" },
      ],
      days,
    );
    expect(m.get("2026-11-10")!.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("vencimiento en palabras", () => {
    expect(dueLabel("2026-11-16", "2026-11-15")).toBe("Mañana");
    expect(dueLabel("2026-11-14", "2026-11-15")).toBe("Venció ayer");
    expect(dueLabel("2026-12-30", "2026-11-15")).toBe("30/12/2026");
  });
});
