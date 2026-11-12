import { beforeEach, describe, expect, it, vi } from "vitest";

const getZxy = vi.fn(async () => ({ data: new ArrayBuffer(4) }));
const getHeader = vi.fn(async () => ({ minZoom: 8, maxZoom: 12, tileType: 2 }));
vi.mock("pmtiles", () => ({
  TileType: { Png: 2, Jpeg: 3, Webp: 4, Avif: 5 },
  PMTiles: class {
    getHeader = getHeader;
    getZxy = getZxy;
  },
}));

import { clearThumbCache, layerThumb, thumbCacheSize, thumbTile, tileOf } from "./sceneThumbs";

const farm: [number, number, number, number] = [-57.01, -25.01, -56.99, -24.99]; // 0,02° de ancho

describe("miniaturas del selector de fecha (S-04)", () => {
  beforeEach(() => {
    clearThumbCache();
    getZxy.mockClear();
    getHeader.mockClear();
    URL.createObjectURL = vi.fn(() => "blob:thumb");
  });

  it("tileOf: esquinas del mundo", () => {
    expect(tileOf(-179.9, 85, 1)).toEqual({ z: 1, x: 0, y: 0 });
    expect(tileOf(179.9, -85, 1)).toEqual({ z: 1, x: 1, y: 1 });
    expect(tileOf(0.1, 0.1, 1)).toEqual({ z: 1, x: 1, y: 0 });
    expect(tileOf(-57.6, -25.3, 10).x).toBe(348);
  });

  it("thumbTile: el zoom en que la tesela abarca el campo, dentro de los zooms del archivo", () => {
    expect(thumbTile(farm, 8, 12).z).toBe(12); // pediría 14, el archivo llega a 12
    expect(thumbTile(farm, 15, 16).z).toBe(15);
    const big: [number, number, number, number] = [-58, -26, -56, -24]; // 2°
    expect(thumbTile(big, 0, 16).z).toBe(7);
    expect(thumbTile(big, 9, 16).z).toBe(9);
  });

  it("pide una sola tesela por fecha y la recuerda", async () => {
    const layer = { pmtilesPath: "farms/a/true_color_1.pmtiles", bounds: "" };
    const [u1, u2] = await Promise.all([layerThumb("https://t.example/", layer, farm), layerThumb("https://t.example", layer, farm)]);
    expect(u1).toBe("blob:thumb");
    expect(u2).toBe("blob:thumb");
    await layerThumb("https://t.example", layer, farm);
    expect(getZxy).toHaveBeenCalledTimes(1);
    await layerThumb("https://t.example", { ...layer, pmtilesPath: "farms/a/true_color_2.pmtiles" }, farm);
    expect(getZxy).toHaveBeenCalledTimes(2);
    expect(thumbCacheSize()).toBe(2);
  });

  it("si el archivo no es ráster o falla la red devuelve null, y la falla de red no queda cacheada", async () => {
    const layer = { pmtilesPath: "x.pmtiles", bounds: "" };
    getHeader.mockResolvedValueOnce({ minZoom: 8, maxZoom: 12, tileType: 1 });
    expect(await layerThumb("https://t.example", layer, farm)).toBeNull();
    clearThumbCache();
    getZxy.mockRejectedValueOnce(new Error("red"));
    expect(await layerThumb("https://t.example", layer, farm)).toBeNull();
    expect(thumbCacheSize()).toBe(0);
    expect(await layerThumb("https://t.example", layer, farm)).toBe("blob:thumb");
  });
});
