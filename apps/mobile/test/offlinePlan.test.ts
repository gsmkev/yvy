import { describe, expect, it } from "vitest";
import { overallProgress, planDownloads, type PackInfo } from "../src/lib/offlinePlan";

const pack = (farmId: string, name: string, over: Partial<PackInfo> = {}): PackInfo => ({ farmId, name, layerCount: 2, upToDate: false, missingBytes: 10_000_000, ...over });

describe("mapas sin conexión de varias estancias (F-26)", () => {
  it("lista solo las estancias con algo para bajar y suma el peso", () => {
    const plan = planDownloads([
      pack("b", "Santa Rita"),
      pack("a", "Agua Dulce", { missingBytes: 4_000_000 }),
      pack("c", "Al día", { upToDate: true, missingBytes: 0 }),
      pack("d", "Sin imagen", { layerCount: 0, missingBytes: 0 }),
    ]);
    expect(plan.farms.map((f) => f.name)).toEqual(["Agua Dulce", "Santa Rita"]);
    expect(plan.totalBytes).toBe(14_000_000);
    expect(plan.withoutImagery).toBe(1);
  });

  it("sin nada pendiente el plan queda vacío", () => {
    const plan = planDownloads([pack("a", "Al día", { upToDate: true, missingBytes: 0 })]);
    expect(plan).toEqual({ farms: [], totalBytes: 0, withoutImagery: 0 });
    expect(overallProgress(plan, [], null, 0)).toBe(1);
  });

  it("el progreso global pesa cada estancia por su tamaño", () => {
    const plan = planDownloads([pack("a", "A", { missingBytes: 30_000_000 }), pack("b", "B", { missingBytes: 10_000_000 })]);
    expect(overallProgress(plan, [], "a", 0.5)).toBeCloseTo(15 / 40, 5);
    expect(overallProgress(plan, ["a"], "b", 0.5)).toBeCloseTo(35 / 40, 5);
    expect(overallProgress(plan, ["a", "b"], null, 0)).toBe(1);
    expect(overallProgress(plan, [], "a", 7)).toBeCloseTo(30 / 40, 5); // fracciones fuera de rango se recortan
  });
});
