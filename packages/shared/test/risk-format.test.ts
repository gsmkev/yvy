import { describe, expect, it } from "vitest";
import { pctOfNormal, riskFormat, type FarmRisk } from "../src";

const LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthName = (m: number, short = false) => (short ? LONG[m - 1]!.slice(0, 3) : LONG[m - 1]!);
const { fmtMmDd, fmtYearMonth, rainByMonth, fireByMonth } = riskFormat(monthName);

describe("formato del informe de riesgo", () => {
  it("fechas y meses con el nombre que pone cada plataforma", () => {
    expect(fmtMmDd("06-20")).toBe("20 de junio");
    expect(fmtMmDd(null)).toBe("—");
    expect(fmtYearMonth("2026-10")).toBe("oct 26");
    expect(fireByMonth([0, 0, 0, 0, 0, 0, 0, 6])[7]).toEqual({ label: "ago", value: 6 });
  });
  it("cruza la lluvia reciente con la normal del mismo mes", () => {
    const rain = {
      annualMeanMm: 1500,
      normal: [{ month: 10, meanMm: 150, p20Mm: 90, p80Mm: 200 }],
      recent: [
        { month: "2026-10", mm: 75 },
        { month: "2026-11", mm: 200 },
      ],
    } as FarmRisk["rain"];
    const r = rainByMonth(rain);
    expect(r[0]).toMatchObject({ key: "2026-10", mm: 75, normalMm: 150, p20Mm: 90, p80Mm: 200 });
    expect(r[1]).toMatchObject({ normalMm: null, p20Mm: null });
  });
  it("porcentaje de lo normal", () => {
    expect(pctOfNormal(75, 150)).toBe(50);
    expect(pctOfNormal(75, null)).toBeNull();
  });
});
