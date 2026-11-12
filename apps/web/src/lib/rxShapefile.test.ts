import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { polygonsToShapefileZip } from "./exports";
import { parseFile } from "./importGeo";

const readBlob = (b: Blob) =>
  new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(b);
  });
const sq = (x: number) => [[[x, -27.2], [x, -27.201], [x + 0.001, -27.201], [x + 0.001, -27.2], [x, -27.2]]];

describe("A-33: shapefile de prescripción", () => {
  it("trae .shp, .shx, .dbf y .prj, con la dosis en la columna RATE", async () => {
    const blob = await polygonsToShapefileZip(
      "prescripcion",
      [
        { geometry: { type: "MultiPolygon", coordinates: [sq(-55.9)] }, row: { RATE: 120.5, ZONE: 1 } },
        { geometry: { type: "MultiPolygon", coordinates: [sq(-55.8), sq(-55.7)] }, row: { RATE: 200, ZONE: 2 } },
      ],
      [
        { name: "RATE", type: "N", length: 12, decimals: 2 },
        { name: "ZONE", type: "N", length: 3 },
      ],
    );
    const buf = await readBlob(blob);
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).sort()).toEqual(["prescripcion.cpg", "prescripcion.dbf", "prescripcion.prj", "prescripcion.shp", "prescripcion.shx"]);
    const dbf = new Uint8Array(await zip.file("prescripcion.dbf")!.async("arraybuffer"));
    expect(new TextDecoder().decode(dbf.slice(32, 36))).toBe("RATE");
    const parsed = await parseFile(new File([buf], "prescripcion.zip"));
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed.every((x) => x.error === null)).toBe(true);
    const text = new TextDecoder().decode(dbf);
    expect(text).toContain("120.50");
    expect(text).toContain("200.00");
  });
});
