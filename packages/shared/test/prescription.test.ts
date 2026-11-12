import { describe, expect, it } from "vitest";
import { buildIsoxml, isoRate, meanRate, totalProduct, validRate, type RatePrescriptionPlan } from "../src";

const sq = (x: number) => [[[x, -27.2], [x + 0.001, -27.2], [x + 0.001, -27.201], [x, -27.201], [x, -27.2]]];
const plan: RatePrescriptionPlan = {
  plotName: 'Lote "Ñandú" <1>',
  product: "Urea & KCl",
  unit: "kg_ha",
  zones: [
    { zone: 1, areaHa: 10, rate: 100, geometry: { type: "MultiPolygon", coordinates: [sq(-55.9)] } },
    { zone: 2, areaHa: 30, rate: 200, geometry: { type: "MultiPolygon", coordinates: [sq(-55.8), sq(-55.7)] } },
  ],
};

describe("A-33 prescripción de dosis variable", () => {
  it("total y dosis media ponderadas por superficie", () => {
    expect(totalProduct(plan.zones)).toBe(7000);
    expect(meanRate(plan.zones)).toBe(175);
    expect(meanRate([])).toBeNull();
  });
  it("valida la dosis", () => {
    expect([0, 150.5].every(validRate)).toBe(true);
    expect([-1, NaN, Infinity, 1e9].some(validRate)).toBe(false);
  });
  it("convierte kg/ha y l/ha a unidades de proceso ISO", () => {
    expect(isoRate("kg_ha", 150)).toEqual({ ddi: "0006", value: 15000 });
    expect(isoRate("l_ha", 2.5)).toEqual({ ddi: "0001", value: 250 });
  });
  it("ISOXML: una zona de tratamiento por zona, con su dosis y los polígonos, y texto escapado", () => {
    const xml = buildIsoxml(plan, new Date("2026-11-12T00:00:00Z"));
    expect(xml).toContain("<ISO11783_TaskData");
    expect(xml.match(/<TZN /g)).toHaveLength(2);
    expect(xml.match(/<PLN /g)).toHaveLength(3); // la zona 2 tiene dos partes
    expect(xml).toContain('<PDV A="0006" B="10000"/>');
    expect(xml).toContain('<PDV A="0006" B="20000"/>');
    expect(xml).toContain("Lote &quot;Ñandú&quot; &lt;1&gt; · Urea &amp; KCl");
    expect(xml).toContain('D="400000"'); // 40 ha en m²
    expect(xml).toContain('<PNT A="2" C="-27.20000000" D="-55.90000000"/>');
  });
});
