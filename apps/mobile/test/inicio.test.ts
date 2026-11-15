import { describe, expect, it } from "vitest";
import { forceReadOnly, isDemoOrg } from "../src/lib/demoLogic";
import { summarizeFarms } from "../src/lib/farmSummary";
import { isOverdue, teamTasksDue } from "../src/lib/teamTasks";
import { areaLabel, cToTemp, haToArea, mmToRain, parseUnits } from "../src/lib/unitsLogic";
import { resolveReadOnly } from "../src/lib/ownerSummary";

describe("demo", () => {
  it("es demo solo si la organización coincide con la guardada", () => {
    expect(isDemoOrg("o1", "o1")).toBe(true);
    expect(isDemoOrg("o1", "o2")).toBe(false);
    expect(isDemoOrg(null, "o1")).toBe(false);
    expect(isDemoOrg("o1", undefined)).toBe(false);
  });
  it("la demo fuerza solo lectura aunque se haya apagado el interruptor", () => {
    const apagado = resolveReadOnly("owner", "0");
    expect(apagado).toBe(false);
    expect(forceReadOnly(true, apagado)).toBe(true);
    expect(forceReadOnly(false, apagado)).toBe(false);
    expect(forceReadOnly(false, true)).toBe(true);
  });
});

describe("tareas del equipo en Hoy", () => {
  const t = (id: string, assigneeId: string, dueDate: string, status = "open") => ({ id, assigneeId, dueDate, status });
  it("vencidas primero, sin las propias ni las futuras ni las hechas", () => {
    const rows = [t("a", "x", "2026-11-15"), t("b", "x", "2026-11-10"), t("c", "me", "2026-11-15"), t("d", "x", "2026-11-20"), t("e", "x", "2026-11-14", "done")];
    expect(teamTasksDue(rows, "me", "2026-11-15").map((r) => r.id)).toEqual(["b", "a"]);
    expect(isOverdue(rows[1]!, "2026-11-15")).toBe(true);
    expect(isOverdue(rows[0]!, "2026-11-15")).toBe(false);
  });
});

describe("resumen de estancias", () => {
  it("cuenta lotes, registros de 7 días, avisos y último registro; avisos primero", () => {
    const now = 100 * 86_400_000;
    const out = summarizeFarms(
      [{ id: "f1", name: "Beta", areaHa: 10 }, { id: "f2", name: "Alfa", areaHa: 5 }],
      [{ farmId: "f1" }, { farmId: "f1" }],
      [{ farmId: "f1", capturedAt: now - 1000 }, { farmId: "f1", capturedAt: now - 20 * 86_400_000 }],
      [{ farmId: "f1" }],
      now,
    );
    expect(out.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(out[0]).toMatchObject({ plots: 2, records7d: 1, alerts: 1, lastRecordAt: now - 1000 });
    expect(out[1]).toMatchObject({ plots: 0, records7d: 0, lastRecordAt: null });
  });
});

describe("unidades", () => {
  it("convierte para mostrar", () => {
    expect(haToArea(1.5, "cuadra")).toBe(2);
    expect(haToArea(1.5, "ha")).toBe(1.5);
    expect(mmToRain(25.4, "in")).toBeCloseTo(1);
    expect(cToTemp(100, "f")).toBe(212);
    expect(areaLabel("cuadra")).toBe("cuadras");
  });
  it("lo guardado corrupto vuelve a los valores por defecto", () => {
    expect(parseUnits("no json")).toEqual({ area: "ha", rain: "mm", temp: "c" });
    expect(parseUnits('{"area":"cuadra","rain":"xx"}')).toEqual({ area: "cuadra", rain: "mm", temp: "c" });
  });
});
