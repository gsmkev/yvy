// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { farmRiskSchema, type FarmRisk } from "@yvy/shared";
import { RiskReport } from "./riskPdf";
import { fireByMonth, fmtMmDd, fmtYearMonth, pctOfNormal, rainByMonth } from "./riskData";
import type { Farm } from "./types";

const farm = { id: "f", name: "La Esperanza", department: "Itapúa", district: "Capitán Meza", areaHa: 100 } as unknown as Farm;

const risk: FarmRisk = {
  version: 1,
  generatedAt: 1,
  normalFrom: 1991,
  normalTo: 2020,
  frost: {
    thresholdC: 2,
    perYear: Array.from({ length: 30 }, (_, i) => ({ year: 1991 + i, days: i % 4 })),
    meanPerYear: 1.5,
    worst: { year: 1994, days: 3 },
    yearsWithFrostPct: 75,
    typicalFirstFrost: "06-20",
    typicalLastFrost: "08-10",
  },
  rain: {
    annualMeanMm: 1500,
    normal: [
      { month: 10, meanMm: 150, p20Mm: 90, p80Mm: 200 },
      { month: 11, meanMm: 140, p20Mm: 80, p80Mm: 190 },
    ],
    recent: [
      { month: "2026-10", mm: 75 },
      { month: "2026-11", mm: 200 },
    ],
  },
  dry: { thresholdMm: 1, meanLongestDays: 18, worst: { year: 1995, days: 40 }, spells15PerYear: 0.8, summerMeanLongestDays: 14 },
  fire: {
    radiusKm: 10,
    years: 3,
    total: 12,
    perYear: [{ from: "2025-11-11", to: "2026-11-10", count: 12 }],
    byMonth: [0, 0, 0, 0, 0, 1, 2, 6, 3, 0, 0, 0],
    nearestKm: 2.3,
    lastAt: 1_780_000_000_000,
    source: "NASA FIRMS VIIRS 375 m",
  },
};

describe("informe de riesgo climático", () => {
  it("el ejemplo cumple el esquema compartido", () => {
    expect(farmRiskSchema.safeParse(risk).success).toBe(true);
  });

  it("PDF con datos, sin focos y sin años", async () => {
    const full = await renderToBuffer(<RiskReport farm={farm} risk={risk} computedAt={1_780_000_000_000} generatedAt={Date.now()} />);
    expect(full.subarray(0, 4).toString()).toBe("%PDF");
    const noFire = await renderToBuffer(
      <RiskReport farm={farm} risk={{ ...risk, fire: null }} computedAt={1} generatedAt={Date.now()} />,
    );
    expect(noFire.length).toBeGreaterThan(500);
    const empty = await renderToBuffer(
      <RiskReport
        farm={farm}
        risk={{
          ...risk,
          frost: { ...risk.frost, perYear: [], worst: null, typicalFirstFrost: null, typicalLastFrost: null },
          rain: { annualMeanMm: 0, normal: [], recent: [] },
          dry: { ...risk.dry, worst: null },
          fire: { ...risk.fire!, total: 0, nearestKm: null, lastAt: null },
        }}
        computedAt={1}
        generatedAt={Date.now()}
      />,
    );
    expect(empty.length).toBeGreaterThan(500);
  });

  it("formatos y cruce con la normal", () => {
    expect(fmtMmDd("06-20")).toBe("20 de junio");
    expect(fmtMmDd(null)).toBe("—");
    expect(fmtYearMonth("2026-10")).toBe("oct 26");
    const r = rainByMonth(risk.rain);
    expect(r[0]).toMatchObject({ key: "2026-10", mm: 75, normalMm: 150, p20Mm: 90, p80Mm: 200 });
    expect(pctOfNormal(75, 150)).toBe(50);
    expect(pctOfNormal(75, null)).toBeNull();
    expect(fireByMonth(risk.fire!.byMonth)[7]).toEqual({ label: "ago", value: 6 });
  });
});
