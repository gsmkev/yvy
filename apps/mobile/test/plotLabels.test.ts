import { describe, expect, it } from "vitest";
import { centroidOf, containsPoint, type Area } from "@yvy/geo";
import { plotLabels, plotTarget } from "../src/lib/plotLabels";

// Lote en L: el centroide cae en el hueco, afuera del lote.
const L: Area = {
  type: "Polygon",
  coordinates: [[[0, 0], [0.01, 0], [0.01, 0.002], [0.002, 0.002], [0.002, 0.01], [0, 0.01], [0, 0]]],
};
const square = (x: number): Area => ({ type: "Polygon", coordinates: [[[x, 0], [x + 0.001, 0], [x + 0.001, 0.001], [x, 0.001], [x, 0]]] });
const plot = (id: string, g: Area, areaHa: number) => ({ id, name: id, geometry: JSON.stringify(g), areaHa });

describe("M-12 etiquetas por punto interior", () => {
  it("el punto cae adentro del lote en L aunque el centroide caiga afuera", () => {
    const c = centroidOf(L);
    expect(containsPoint(L, c.lon, c.lat)).toBe(false);
    const [label] = plotLabels([plot("l", L, 50)], 10);
    expect(containsPoint(L, label!.lon, label!.lat)).toBe(true);
    const target = plotTarget(JSON.stringify(L));
    expect(containsPoint(L, target.lon, target.lat)).toBe(true);
  });

  it("con más lotes que el máximo se rotulan los más grandes", () => {
    const labels = plotLabels([plot("chico", square(1), 2), plot("grande", square(2), 90), plot("medio", square(3), 30)], 2);
    expect(labels.map((l) => l.id)).toEqual(["grande", "medio"]);
  });
});
