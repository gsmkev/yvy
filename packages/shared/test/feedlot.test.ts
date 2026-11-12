import { describe, expect, it } from "vitest";
import { consumptionLines, corralReport, feedRationInput, rationLines, rationPctTotal, type BaseUnit } from "../src";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const DAY = 86_400_000;

describe("G-33 feedlot", () => {
  it("la ración suma 100 % de materia seca, sin ingredientes repetidos", () => {
    const ok = { name: "Terminación", items: [{ productId: A, pctDm: 60, dmPct: 88 }, { productId: B, pctDm: 40, dmPct: 35 }] };
    expect(feedRationInput.safeParse(ok).success).toBe(true);
    expect(feedRationInput.safeParse({ ...ok, items: [{ productId: A, pctDm: 60 }, { productId: B, pctDm: 30 }] }).success).toBe(false);
    expect(feedRationInput.safeParse({ ...ok, items: [{ productId: A, pctDm: 50 }, { productId: A, pctDm: 50 }] }).success).toBe(false);
    expect(rationPctTotal(ok.items)).toBe(100);
  });
  it("kilos tal cual de cada ingrediente a partir de la materia seca", () => {
    const l = rationLines([{ productId: A, pctDm: 60, dmPct: 88 }, { productId: B, pctDm: 40, dmPct: 35 }], 100);
    expect(l).toEqual([{ productId: A, kg: 68.18 }, { productId: B, kg: 114.29 }]);
  });
  it("el consumo del registro feed descuenta solo productos del catálogo medidos en kg", () => {
    const units = new Map<string, BaseUnit>([[A, "kg"], [B, "l"]]);
    const lines = consumptionLines("feed", { items: [{ productId: A, kg: 10 }, { productId: B, kg: 5 }, { productId: "otro", kg: 1 }] }, { plotAreaHa: null, units });
    expect(lines).toEqual([{ productId: A, qty: 10 }]);
  });
  it("conversión entre la primera y la última pesada; sin pesadas o sin ganancia no se inventa", () => {
    const t0 = 1_000_000_000_000;
    const feeds = [
      { plotId: "c1", at: t0 + 2 * DAY, kgDm: 500, kgAsFed: 900 },
      { plotId: "c1", at: t0 + 10 * DAY, kgDm: 500, kgAsFed: 900 },
      { plotId: "c1", at: t0 + 30 * DAY, kgDm: 500, kgAsFed: 900 },
      { plotId: "c2", at: t0, kgDm: 100, kgAsFed: 150 },
      { plotId: "c3", at: t0 + DAY, kgDm: 100, kgAsFed: 150 },
    ];
    const w = [
      { plotId: "c1", at: t0, kg: 300, head: 50 },
      { plotId: "c1", at: t0 + 20 * DAY, kg: 330, head: 50 },
      { plotId: "c3", at: t0, kg: 300, head: 10 },
      { plotId: "c3", at: t0 + 20 * DAY, kg: 290, head: 10 },
    ];
    const r = Object.fromEntries(corralReport(feeds, w).map((x) => [x.plotId, x]));
    expect(r.c1).toMatchObject({ status: "ok", gainKg: 1500, windowKgDm: 1000, conversion: 0.67, dailyGainKg: 1.5, feedKgDm: 1500 });
    expect(r.c2).toMatchObject({ status: "no_weighings", conversion: null });
    expect(r.c3).toMatchObject({ status: "no_gain", conversion: null });
  });
});
