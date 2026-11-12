// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { BankReport } from "./reportsBankPdf";
import type { Alert, Farm, Plot } from "./types";

const farm = {
  id: "f",
  name: "La Esperanza",
  department: "Itapúa",
  district: "Capitán Meza",
  areaHa: 100,
  minLon: -55.9,
  minLat: -27.3,
  maxLon: -55.8,
  maxLat: -27.2,
  geometry: JSON.stringify({ type: "Polygon", coordinates: [[[-55.9, -27.3], [-55.8, -27.3], [-55.8, -27.2], [-55.9, -27.3]]] }),
} as unknown as Farm;
const plots = [
  { id: "p1", name: "Lote 1", kind: "crop", crop: "soja", areaHa: 40, geometry: farm.geometry },
  { id: "p2", name: "Potrero", kind: "pasture", crop: null, areaHa: 60, geometry: farm.geometry },
] as unknown as Plot[];

describe("PDF del informe para el banco", () => {
  it("se genera con datos y con todo vacío", async () => {
    const alerts = [
      { id: "a", kind: "frost", severity: "watch", summary: "Posible helada", source: "MET Norway" },
    ] as unknown as Alert[];
    const full = await renderToBuffer(
      <BankReport
        farm={farm}
        plots={plots}
        vigor={new Map([["p1", { n: 3, last: 0.7, lastAt: 1, max: 0.8, min: 0.3, mean: 0.5 }]])}
        rain30={80}
        normal30={100}
        rainSeason={400}
        normalSeason={500}
        seasonFrom="2026-09-01"
        to="2026-11-10"
        alerts={alerts}
        generatedAt={Date.now()}
      />,
    );
    expect(full.subarray(0, 4).toString()).toBe("%PDF");
    const empty = await renderToBuffer(
      <BankReport
        farm={farm}
        plots={[]}
        vigor={new Map()}
        rain30={null}
        normal30={null}
        rainSeason={null}
        normalSeason={null}
        seasonFrom="2026-09-01"
        to="2026-11-10"
        alerts={[]}
        generatedAt={Date.now()}
      />,
    );
    expect(empty.length).toBeGreaterThan(500);
  });
});
