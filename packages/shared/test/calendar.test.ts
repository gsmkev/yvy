import { describe, expect, it } from "vitest";
import { dueLabel, tasksByDay, weekDays, weekStart } from "../src/calendar";

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

describe("calendario de la app", () => {
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
