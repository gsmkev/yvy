import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { classifyPrj, parseFile } from "./importGeo";
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

  it("M-11: limpia vértices repetidos y cuenta lo corregido", async () => {
    const dirty = `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Sucio</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-55.95,-27.15 -55.93,-27.15 -55.93,-27.15 -55.93,-27.17 -55.95,-27.17 -55.95,-27.15</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
    const [p] = await parseFile(new File([dirty], "sucio.kml"));
    expect(p).toMatchObject({ error: null, fixed: 1 });
    expect((p!.geometry.coordinates[0] as number[][]).length).toBe(5);
  });

  it("M-07: KMZ con doc.kml", async () => {
    const z = new JSZip();
    z.file("doc.kml", KML);
    const polys = await parseFile(new File([await z.generateAsync({ type: "arraybuffer" })], "lotes.kmz"));
    expect(polys.map((p) => p.name)).toEqual(["Lote Norte", "Moño"]);
  });

  describe("M-07: shapefile y proyecciones", () => {
    /** Shapefile mínimo de un polígono (tipo 5) sin .dbf. */
    const shpOf = (ring: number[][]) => {
      const n = ring.length;
      const contentLen = 44 + 4 + 16 * n; // tipo + bbox + partes + puntos + arrays
      const total = 100 + 8 + contentLen;
      const b = new DataView(new ArrayBuffer(total));
      b.setInt32(0, 9994);
      b.setInt32(24, total / 2);
      b.setInt32(28, 1000, true);
      b.setInt32(32, 5, true);
      const xs = ring.map((p) => p[0]!);
      const ys = ring.map((p) => p[1]!);
      const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      bbox.forEach((v, i) => b.setFloat64(36 + i * 8, v, true));
      b.setInt32(100, 1);
      b.setInt32(104, contentLen / 2);
      b.setInt32(108, 5, true);
      bbox.forEach((v, i) => b.setFloat64(112 + i * 8, v, true));
      b.setInt32(144, 1, true);
      b.setInt32(148, n, true);
      b.setInt32(152, 0, true);
      ring.forEach((p, i) => {
        b.setFloat64(156 + i * 16, p[0]!, true);
        b.setFloat64(164 + i * 16, p[1]!, true);
      });
      return b.buffer;
    };
    const zipOf = async (ring: number[][], prj?: string) => {
      const z = new JSZip();
      z.file("lotes.shp", shpOf(ring));
      if (prj) z.file("lotes.prj", prj);
      return new File([await z.generateAsync({ type: "arraybuffer" })], "lotes.zip");
    };
    const UTM21S =
      'PROJCS["WGS_1984_UTM_Zone_21S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-57.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
    const WGS84 =
      'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

    it("clasifica el .prj", () => {
      expect(classifyPrj(WGS84)).toBe("wgs84");
      expect(classifyPrj(UTM21S)).toBe("utm");
      expect(classifyPrj(UTM21S.replace("21S", "20S"))).toBe("utm");
      expect(classifyPrj(UTM21S.replace("21S", "22S").replace("-57.0", "-51.0"))).toBe("unsupported");
      expect(classifyPrj('PROJCS["Gauss_Kruger",GEOGCS["GCS_Other"]]')).toBe("unsupported");
    });

    it("reproyecta UTM 21S a WGS84", async () => {
      const ring = [[500000, 7000000], [501000, 7000000], [501000, 7001000], [500000, 7001000], [500000, 7000000]];
      const [p] = await parseFile(await zipOf(ring, UTM21S));
      const [lon, lat] = (p!.geometry.coordinates[0] as number[][])[0]!;
      expect(lon).toBeCloseTo(-57, 3);
      expect(lat).toBeGreaterThan(-27.3);
      expect(lat).toBeLessThan(-26.9);
      expect(p!.areaHa).toBeGreaterThan(90);
      expect(p!.areaHa).toBeLessThan(110);
    });

    it("WGS84 sin .prj pasa tal cual y UTM sin .prj avisa", async () => {
      const deg = [[-55.95, -27.15], [-55.93, -27.15], [-55.93, -27.17], [-55.95, -27.17], [-55.95, -27.15]];
      expect(await parseFile(await zipOf(deg))).toHaveLength(1);
      const utm = [[500000, 7000000], [501000, 7000000], [501000, 7001000], [500000, 7001000], [500000, 7000000]];
      await expect(parseFile(await zipOf(utm))).rejects.toThrow(/prj/);
    });

    it("rechaza otras proyecciones con un mensaje claro", async () => {
      const ring = [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]];
      await expect(parseFile(await zipOf(ring, 'PROJCS["Gauss_Kruger",GEOGCS["GCS_Other"]]'))).rejects.toThrow(
        /sistema de coordenadas/,
      );
    });
  });
});
