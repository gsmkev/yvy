import { describe, expect, it } from "vitest";
import { cropKc, dayOfYearIso, et0Hargreaves, extraterrestrialMm, waterBalance, type BalanceDay } from "../src";

describe("balance hídrico (C-08)", () => {
  it("Kc por fase de la soja", () => {
    expect(cropKc("soja", -1)).toBeNull();
    expect(cropKc("soja", 0)).toBe(0.4);
    expect(cropKc("soja", 35)).toBeCloseTo(0.775, 3); // mitad del desarrollo
    expect(cropKc("soja", 70)).toBe(1.15);
    expect(cropKc("soja", 200)).toBe(0.5);
    expect(cropKc("chia", 10)).toBeNull();
  });

  it("radiación extraterrestre y ET0 de verano en Paraguay son razonables", () => {
    // 1 de enero a -27°: ~17 mm equivalentes
    expect(extraterrestrialMm(-27, 1)).toBeGreaterThan(16);
    expect(extraterrestrialMm(-27, 1)).toBeLessThan(18.5);
    const et0 = et0Hargreaves(21, 33, -27, 1);
    expect(et0).toBeGreaterThan(5);
    expect(et0).toBeLessThan(7.5);
    expect(et0Hargreaves(21, 21, -27, 1)).toBe(0); // sin amplitud térmica no hay estimación
    expect(dayOfYearIso("2026-01-01")).toBe(1);
    expect(dayOfYearIso("2026-03-01")).toBe(60);
  });

  const days = (n: number, rain: number | null, from = "2026-12-01"): BalanceDay[] =>
    Array.from({ length: n }, (_, i) => ({
      date: new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
      rainMm: rain,
      tminC: 21,
      tmaxC: 33,
    }));

  it("sin lluvia el balance cae y el riesgo es alto; con lluvia abundante es bajo", () => {
    const dry = waterBalance(days(40, 0), "soja", "2026-12-01", -27)!;
    expect(dry.days).toBe(40);
    expect(dry.balanceMm).toBeLessThan(-100);
    expect(dry.risk).toBe("high");
    expect(dry.series.at(-1)!.cumMm).toBe(dry.balanceMm);
    const wet = waterBalance(days(40, 10), "soja", "2026-12-01", -27)!;
    expect(wet.balanceMm).toBeGreaterThan(0);
    expect(wet.risk).toBe("low");
  });

  it("los días sin lluvia o sin temperatura no cuentan y sin días no hay balance", () => {
    const mixed = [...days(20, 5), ...days(5, null, "2026-12-21")];
    expect(waterBalance(mixed, "soja", "2026-12-01", -27)!.days).toBe(20);
    expect(waterBalance(days(10, null), "soja", "2026-12-01", -27)).toBeNull();
    expect(waterBalance(days(10, 5), "chia", "2026-12-01", -27)).toBeNull();
    // antes de la siembra no se cuenta
    expect(waterBalance(days(10, 5), "soja", "2026-12-06", -27)!.days).toBe(5);
    // menos de 14 días: sin riesgo
    expect(waterBalance(days(10, 5), "soja", "2026-12-01", -27)!.risk).toBeNull();
  });

  it("A-43: el riego suma al balance y sin temperatura queda solo lluvia más riego", () => {
    const d = days(20, 0);
    const dry = waterBalance(d, "soja", "2026-12-01", -27)!;
    const irrigated = waterBalance(d, "soja", "2026-12-01", -27, { irrigation: { "2026-12-05": 30, "2026-12-19": 20 } })!;
    expect(irrigated.irrigationMm).toBe(50);
    expect(irrigated.balanceMm).toBeCloseTo(dry.balanceMm + 50, 1);
    expect(irrigated.series[4]!.irrigationMm).toBe(30);
    expect(irrigated.balance14Mm).toBeCloseTo(dry.balance14Mm! + 20, 1);
    // sin temperatura: con keepWithoutEt el día cuenta sin consumo y no hay riesgo; sin la opción se descarta
    const noTemp = d.map((x) => ({ ...x, tminC: null, tmaxC: null }));
    expect(waterBalance(noTemp, "soja", "2026-12-01", -27)).toBeNull();
    const rainOnly = waterBalance(noTemp, "soja", "2026-12-01", -27, { irrigation: { "2026-12-05": 30 }, keepWithoutEt: true })!;
    expect(rainOnly).toMatchObject({ days: 20, etMissingDays: 20, etcMm: 0, irrigationMm: 30, balanceMm: 30, risk: null });
    expect(rainOnly.series[0]!.etcMm).toBeNull();
  });
});
