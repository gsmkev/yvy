import { describe, expect, it } from "vitest";
import { withdrawalReport } from "../src";

const app = (date: string, products: { name: string; withdrawalDays: number | null }[], plotId = "p1") => ({
  plotId,
  date,
  products,
});

describe("período de carencia (A-14)", () => {
  it("la restricción vigente es la que libera más tarde y cuenta los días que faltan", () => {
    const r = withdrawalReport(
      [
        app("2026-11-01", [{ name: "Fungicida A", withdrawalDays: 21 }]),
        app("2026-11-05", [{ name: "Insecticida B", withdrawalDays: 7 }, { name: "Herbicida C", withdrawalDays: 0 }]),
      ],
      [],
      "2026-11-10",
    );
    expect(r.restrictions).toEqual([
      { plotId: "p1", safeFrom: "2026-11-22", daysLeft: 12, product: "Fungicida A", appliedOn: "2026-11-01" },
    ]);
    expect(r.violations).toEqual([]);
  });

  it("una carencia ya cumplida no restringe; el mismo día de vencimiento ya se puede cosechar", () => {
    const apps = [app("2026-11-01", [{ name: "A", withdrawalDays: 9 }])];
    expect(withdrawalReport(apps, [], "2026-11-10").restrictions).toEqual([]);
    expect(withdrawalReport(apps, [], "2026-11-09").restrictions).toHaveLength(1);
  });

  it("detecta cosechas hechas antes de cumplir la carencia, sin duplicar y sin contar aplicaciones posteriores", () => {
    const r = withdrawalReport(
      [
        app("2026-10-20", [{ name: "A", withdrawalDays: 14 }]),
        app("2026-11-08", [{ name: "B", withdrawalDays: 30 }]), // después de la cosecha: no la afecta
      ],
      [
        { plotId: "p1", date: "2026-11-01" },
        { plotId: "p1", date: "2026-11-01" },
        { plotId: "p1", date: "2026-11-05" }, // cumplida (20/10 + 14 = 3/11)
        { plotId: "p2", date: "2026-11-01" }, // otro lote
      ],
      "2026-11-10",
    );
    expect(r.violations).toEqual([
      { plotId: "p1", harvestedOn: "2026-11-01", safeFrom: "2026-11-03", product: "A", appliedOn: "2026-10-20" },
    ]);
  });

  it("los productos sin carencia cargada se informan aparte", () => {
    const r = withdrawalReport(
      [app("2026-11-01", [{ name: "Producto a mano", withdrawalDays: null }]), app("2026-11-02", [{ name: "Producto a mano", withdrawalDays: null }])],
      [],
      "2026-11-10",
    );
    expect(r.restrictions).toEqual([]);
    expect(r.unknown).toEqual([{ plotId: "p1", product: "Producto a mano", appliedOn: "2026-11-01" }]);
  });
});
