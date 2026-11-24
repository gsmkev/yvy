import { describe, expect, it } from "vitest";
import { boundaryUrl, parseBoundaries } from "./boundaries";

const square = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

describe("boundaries", () => {
  it("arma la URL junto a las teselas", () => {
    expect(boundaryUrl("https://t.example/", "adm1")).toBe("https://t.example/boundaries/pry-adm1.geojson");
    expect(boundaryUrl(undefined, "adm2")).toBeNull();
  });
  it("acepta polígonos con nombre", () => {
    const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Itapúa" }, geometry: square }] };
    expect(parseBoundaries(fc)).not.toBeNull();
  });
  it("rechaza lo que no es una colección usable", () => {
    expect(parseBoundaries(null)).toBeNull();
    expect(parseBoundaries({ type: "FeatureCollection", features: [] })).toBeNull();
    expect(parseBoundaries({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: square }] })).toBeNull();
    expect(parseBoundaries({ error: "not found" })).toBeNull();
  });
});
