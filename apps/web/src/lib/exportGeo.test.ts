import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { plotsToGeoJson, plotsToShapefileZip } from "./exports";
import { parseFile } from "./importGeo";

const sqr = [
  [-55.95, -27.15],
  [-55.93, -27.15],
  [-55.93, -27.17],
  [-55.95, -27.17],
  [-55.95, -27.15],
];
const plot = {
  id: "1",
  farmId: "f",
  name: "Lote Ñandú",
  kind: "crop" as const,
  geometry: JSON.stringify({ type: "Polygon", coordinates: [sqr] }),
  areaHa: 441.234,
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
};
const readBlob = (b: Blob) =>
  new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(b);
  });
const pts = [{ name: "Aguada", kind: "water", lon: -55.94, lat: -27.16 }];

describe("M-21: exportar GeoJSON y shapefile", () => {
  it("GeoJSON trae lotes y puntos", () => {
    const fc = JSON.parse(plotsToGeoJson([plot], pts));
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({ nombre: "Lote Ñandú", cultivo: "soja", superficie_ha: 441.23 });
    expect(fc.features[1].geometry.type).toBe("Point");
  });

  it("el shapefile exportado se vuelve a leer igual", async () => {
    const buf = await readBlob(await plotsToShapefileZip([plot], pts));
    const names = Object.keys((await JSZip.loadAsync(buf)).files);
    expect(names).toEqual(expect.arrayContaining(["lotes.shp", "lotes.dbf", "lotes.prj", "puntos.shp"]));
    const polys = await parseFile(new File([buf], "export.zip"));
    expect(polys.find((p) => p.name === "Lote Ñandú")).toMatchObject({ error: null });
    expect(polys.find((p) => p.name === "Lote Ñandú")!.areaHa).toBeCloseTo(441, -1);
  });
});
