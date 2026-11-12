import { describe, expect, it } from "vitest";
import { cameraDiffers, defaultCompare, layerDates, pickLayer } from "./scenes";
import type { Layer } from "./types";

const L = (id: string, layer: Layer["layer"], acquiredAt: number): Layer => ({
  id,
  layer,
  acquiredAt,
  pmtilesPath: `${id}.pmtiles`,
  bytes: 1,
  bounds: "[]",
});
const layers = [L("a", "ndvi", 100), L("b", "ndvi", 300), L("c", "ndvi", 200), L("d", "true_color", 50), L("e", "ndvi", 300)];

describe("fechas de imagen", () => {
  it("lista por tipo, de la más nueva a la más vieja y sin repetir fecha", () => {
    expect(layerDates(layers, "ndvi").map((l) => l.id)).toEqual(["b", "c", "a"]);
    expect(layerDates(layers, "true_color").map((l) => l.id)).toEqual(["d"]);
  });

  it("elige la pedida o, si no existe, la más nueva", () => {
    expect(pickLayer(layers, "ndvi", "c")?.id).toBe("c");
    expect(pickLayer(layers, "ndvi", "zzz")?.id).toBe("b");
    expect(pickLayer(layers, "ndvi")?.id).toBe("b");
    expect(pickLayer([], "ndvi")).toBeUndefined();
  });

  it("comparar necesita dos fechas: izquierda la anterior, derecha la última", () => {
    expect(defaultCompare(layers, "ndvi")).toEqual({ left: "c", right: "b" });
    expect(defaultCompare(layers, "true_color")).toBeNull();
  });

  it("las cámaras casi iguales no se vuelven a aplicar", () => {
    const cam = { center: [-55.9, -27.2] as [number, number], zoom: 12, bearing: 0, pitch: 0 };
    expect(cameraDiffers(cam, { ...cam, zoom: 12 + 1e-6 })).toBe(false);
    expect(cameraDiffers(cam, { ...cam, center: [-55.8, -27.2] })).toBe(true);
  });
});
