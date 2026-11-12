import { describe, expect, it } from "vitest";
import { buildAuditReport, distanceM } from "./auditReportData";
import type { Poi, Product, RecordRow } from "./types";

const DAY = 86_400_000;
const rec = (o: Partial<RecordRow> & { data: Record<string, unknown> }): RecordRow =>
  ({ id: "r", farmId: "f", plotId: "p1", poiId: null, authorId: "u", authorName: "Ramón", plotName: "Lote 1", kind: "application", lon: -55.9, lat: -27.2, gpsAccuracyM: null, capturedAt: 1_000 * DAY, attachments: [], ...o }) as RecordRow;
const prod: Product = { id: "glifo", name: "Glifosato", type: "agrochemical", unit: "l", activeIngredient: "glifosato", withdrawalDays: 20, toxClass: "III" };

describe("informe de auditoría (R-05)", () => {
  it("distancia haversine en metros", () => {
    expect(Math.round(distanceM(-55.9, -27.2, -55.9, -27.199))).toBeGreaterThan(105);
    expect(distanceM(1, 1, 1, 1)).toBe(0);
  });

  it("cruza producto, carencia, operador y distancia a agua", () => {
    const pois = [{ id: "w", farmId: "f", kind: "water", name: "Aguada norte", lon: -55.9, lat: -27.1999 }] as Poi[];
    const r = buildAuditReport({
      from: "2026-01-01",
      to: "2026-12-31",
      applications: [rec({ id: "a1", data: { products: [{ productId: "glifo", name: "Glifosato", dose: 2, unit: "l_ha" }], areaHa: 40, windKmh: 8, machine: "Pulverizadora" } })],
      harvests: [],
      products: [prod],
      pois,
    });
    const a = r.applications[0]!;
    expect(a.products[0]).toMatchObject({ activeIngredient: "glifosato", toxClass: "III", withdrawalDays: 20 });
    expect(a.safeHarvestAt).toBe(1_000 * DAY + 20 * DAY);
    expect(a.nearestName).toBe("Aguada norte");
    expect(a.nearestM).toBeLessThan(30);
    expect(a.flags).toEqual(["near_water_or_house"]);
    expect(r).toMatchObject({ totalHa: 40, flagged: 1, operators: [{ name: "Ramón", applications: 1 }] });
  });

  it("marca cosecha dentro de la carencia, producto sin carencia, sin ubicación y viento", () => {
    const r = buildAuditReport({
      from: "a",
      to: "b",
      applications: [
        rec({ id: "a1", lon: null, lat: null, data: { products: [{ name: "Raro", dose: 1, unit: "l_ha" }], windKmh: 30 } }),
        rec({ id: "a2", data: { products: [{ productId: "glifo", name: "Glifosato", dose: 1, unit: "l_ha" }] } }),
      ],
      harvests: [rec({ kind: "harvest", capturedAt: 1_000 * DAY + 5 * DAY, data: {} })],
      products: [prod],
      pois: [],
    });
    expect(r.applications[0]!.flags).toEqual(["no_location", "no_withdrawal", "wind"]);
    expect(r.applications[1]!.flags).toEqual(["harvest_in_withdrawal"]);
  });
});
