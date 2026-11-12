import { describe, expect, it } from "vitest";
import { tasksByDay, weekDays, weekStart } from "./calendar";

describe("calendario semanal (T-04)", () => {
  it("la semana empieza el lunes", () => {
    expect(weekStart("2026-11-11")).toBe("2026-11-09"); // miércoles
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // domingo
    expect(weekDays("2026-11-09")).toHaveLength(7);
    expect(weekDays("2026-11-09")[6]).toBe("2026-11-15");
  });

  it("agrupa por día, deja afuera las canceladas y ordena por hora y prioridad", () => {
    const days = weekDays("2026-11-09");
    const mk = (dueDate: string, dueTime: string | null, priority: string, status = "open") => ({ dueDate, dueTime, priority, status });
    const g = tasksByDay(
      [mk("2026-11-10", null, "high"), mk("2026-11-10", "08:00", "low"), mk("2026-11-10", null, "low"), mk("2026-11-11", null, "normal", "cancelled"), mk("2026-12-01", null, "normal")],
      days,
    );
    expect(g.get("2026-11-10")!.map((x) => [x.dueTime, x.priority])).toEqual([
      ["08:00", "low"],
      [null, "high"],
      [null, "low"],
    ]);
    expect(g.get("2026-11-11")).toEqual([]);
    expect([...g.values()].flat()).toHaveLength(3);
  });
});
