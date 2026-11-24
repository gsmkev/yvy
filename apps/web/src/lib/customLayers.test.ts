import { describe, expect, it } from "vitest";
import { customFileMime, customMaxBytes, parseCornerInputs } from "./customLayers";

describe("capas propias", () => {
  it("reconoce el tipo por mime o extensión", () => {
    expect(customFileMime({ name: "a.png", type: "image/png" })).toBe("image/png");
    expect(customFileMime({ name: "dron.TIF", type: "" })).toBe("image/tiff");
    expect(customFileMime({ name: "x.jpeg", type: "" })).toBe("image/jpeg");
    expect(customFileMime({ name: "x.pdf", type: "application/pdf" })).toBeNull();
  });
  it("el GeoTIFF admite más peso que una imagen", () => {
    expect(customMaxBytes("image/tiff")).toBeGreaterThan(customMaxBytes("image/png"));
  });
  it("lee cuatro esquinas lat, lon", () => {
    const c = parseCornerInputs(["-27.2, -55.9", "-27.2, -55.8", "-27.3, -55.8", "-27.3, -55.9"]);
    expect(c?.[0]).toEqual([-55.9, -27.2]);
    expect(parseCornerInputs(["-27.2, -55.9", "x", "-27.3, -55.8", "-27.3, -55.9"])).toBeNull();
    expect(parseCornerInputs(["-27.2, -55.9", "-27.2, -55.9", "-27.2, -55.9", "-27.2, -55.9"])).toBeNull();
  });
});
