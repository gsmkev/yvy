import { describe, expect, it } from "vitest";
import { newId } from "../src/ids";
import { parsePoiQr, poiQrPayload } from "../src/qr";

describe("QR de puntos de interés (F-28)", () => {
  it("ida y vuelta", () => {
    const id = newId();
    expect(parsePoiQr(poiQrPayload(id))).toBe(id);
  });
  it("tolera espacios y mayúsculas del lector", () => {
    const id = newId();
    expect(parsePoiQr(`  ${poiQrPayload(id).toUpperCase().replace("YVY://POI?ID=", "yvy://poi?id=")}\n`)).toBe(id);
  });
  it("no confunde con el QR de vinculación ni con otros textos", () => {
    expect(parsePoiQr("yvy://link?c=abcdefabcdefabcdefabcdefabcdef")).toBeNull();
    expect(parsePoiQr("https://example.com")).toBeNull();
    expect(parsePoiQr("yvy://poi?id=no-es-uuid")).toBeNull();
    expect(parsePoiQr(`yvy://poi?id=${newId()}&x=1`)).toBeNull();
  });
});
