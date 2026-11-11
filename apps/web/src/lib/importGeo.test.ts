import { describe, expect, it } from "vitest";
import { parseFile } from "./importGeo";
import { plotsToKml } from "./exports";

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Lote Norte</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-55.95,-27.15,0 -55.93,-27.15,0 -55.93,-27.17,0 -55.95,-27.17,0 -55.95,-27.15,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Moño</name><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 1,1 1,0 0,1 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Pluviómetro</name><Point><coordinates>-55.94,-27.16</coordinates></Point></Placemark>
</Document></kml>`;

describe("importación de lotes", () => {
  it("KML: nombres, superficie y autointersección", async () => {
    const polys = await parseFile(new File([KML], "lotes.kml"));
    expect(polys).toHaveLength(2);
    expect(polys[0]).toMatchObject({ name: "Lote Norte", error: null });
    expect(polys[0]!.areaHa).toBeGreaterThan(400);
    expect(polys[1]!.error).toBe("self_intersection");
  });

  it("GeoJSON y vuelta a KML", async () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { NOMBRE: "Potrero 3" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-55.95, -27.15],
                [-55.93, -27.15],
                [-55.93, -27.17],
                [-55.95, -27.15],
              ],
            ],
          },
        },
      ],
    };
    const [p] = await parseFile(new File([JSON.stringify(fc)], "x.geojson"));
    expect(p!.name).toBe("Potrero 3");
    const kml = plotsToKml(
      [
        {
          id: "1",
          farmId: "f",
          name: "A & B",
          kind: "crop",
          geometry: JSON.stringify(p!.geometry),
          areaHa: p!.areaHa,
          crop: "soja",
          season: null,
          sowingDate: null,
          pastureType: null,
          color: null,
          ndviMean: null,
          ndviAt: null,
          ndviPrevMean: null,
          ndviPrevAt: null,
          lastRecordAt: null,
        },
      ],
      "Estancia",
    );
    expect(kml).toContain("<name>A &amp; B</name>");
    expect(kml).toContain("-55.95,-27.15");
  });
});
