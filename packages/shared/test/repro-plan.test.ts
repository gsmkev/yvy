import { describe, expect, it } from "vitest";
import { addMonths, currentCycleYear, cycleWindow, isBreedingStart, reproPlan } from "../src";

describe("plan reproductivo", () => {
  const byId = (y: number, start?: string, days?: number) => Object.fromEntries(reproPlan(y, start, days).map((s) => [s.id, s]));
  it("por defecto: servicio 1/11 por 90 días, y el servicio cruza el año", () => {
    const p = byId(2026);
    expect(p.service).toEqual({ id: "service", from: "2026-11-01", to: "2027-01-29" });
    expect(p.prep).toEqual({ id: "prep", from: "2026-09-17", to: "2026-10-31" });
    expect(p.tacto).toEqual({ id: "tacto", from: "2027-03-30", to: "2027-03-30" });
    expect(p.calving).toEqual({ id: "calving", from: "2027-08-11", to: "2027-11-08" });
    expect(p.weaning).toEqual({ id: "weaning", from: "2028-03-11", to: "2028-06-08" });
    expect(p.heifer_vaccine).toEqual({ id: "heifer_vaccine", from: "2027-11-11", to: "2028-07-08" });
  });
  it("en orden cronológico", () => {
    const ids = reproPlan(2026).map((s) => s.id);
    expect(ids).toEqual(["prep", "service", "tacto", "calving", "heifer_vaccine", "weaning"]);
  });
  it("estación propia dentro del mismo año", () => {
    const p = byId(2026, "10-15", 60);
    expect(p.service).toEqual({ id: "service", from: "2026-10-15", to: "2026-12-13" });
    expect(p.tacto!.from).toBe("2027-02-11");
    expect(p.calving!.from).toBe("2027-07-25");
  });
  it("suma de meses sin salirse del mes", () => {
    expect(addMonths("2027-08-31", 7)).toBe("2028-03-31");
    expect(addMonths("2027-07-31", 7)).toBe("2028-02-29");
    expect(addMonths("2027-12-15", 1)).toBe("2028-01-15");
  });
  it("ciclo actual: el último que ya empezó su preparación", () => {
    expect(currentCycleYear("2026-11-24")).toBe(2026);
    expect(currentCycleYear("2027-03-01")).toBe(2026);
    expect(currentCycleYear("2027-09-10")).toBe(2026);
    expect(currentCycleYear("2027-09-17")).toBe(2027);
    expect(currentCycleYear("2026-09-16")).toBe(2025);
  });
  it("ventana de indicadores y validación", () => {
    expect(cycleWindow(2026)).toEqual({ from: "2026-11-01", to: "2028-06-08" });
    expect(isBreedingStart("11-01")).toBe(true);
    expect(isBreedingStart("02-30")).toBe(false);
    expect(isBreedingStart("13-01")).toBe(false);
    expect(isBreedingStart("1/11")).toBe(false);
  });
});

import { reproPlan as rp, stageTaskDate, upcomingStages } from "../src";
describe("tareas del plan", () => {
  it("solo las etapas que no terminaron, con la fecha de hoy si ya empezaron", () => {
    const stages = rp(2026);
    const up = upcomingStages(stages, "2027-01-10");
    expect(up.map((s) => s.id)).toEqual(["service", "tacto", "calving", "heifer_vaccine", "weaning"]);
    expect(stageTaskDate(up[0]!, "2027-01-10")).toBe("2027-01-10");
    expect(stageTaskDate(up[1]!, "2027-01-10")).toBe("2027-03-30");
  });
});
