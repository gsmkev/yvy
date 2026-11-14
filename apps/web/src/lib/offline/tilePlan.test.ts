import { LIMITS } from "@yvy/shared/limits";
import { describe, expect, it } from "vitest";
import type { Layer } from "../types";
import { checkRoom, countryTilePlan, COUNTRY_BASEMAP, latToY, lonToX, OfflineQuotaError, PARAGUAY, planFarm, sizeMap, tilesIn } from "./tilePlan";

const farmBbox: [number, number, number, number] = [-55.96, -27.21, -55.88, -27.14]; // Itapúa

const layer = (id: string, kind: Layer["layer"], acquiredAt: number, bytes: number): Layer => ({
  id,
  layer: kind,
  acquiredAt,
  pmtilesPath: `layers/f1/${kind}-${acquiredAt}.pmtiles`,
  bytes,
  bounds: "",
});

describe("teselas", () => {
  it("coordenadas de teselas (esquema XYZ)", () => {
    expect(lonToX(-180, 5)).toBe(0);
    expect(lonToX(179.99, 5)).toBe(31);
    expect(lonToX(-55.9, 1)).toBe(0);
    expect(latToY(-27.2, 1)).toBe(1);
    expect(latToY(10, 1)).toBe(0);
    expect(latToY(-27.2, 0)).toBe(0);
  });
  it("tilesIn cubre el rectángulo y nunca se sale del zoom", () => {
    expect(tilesIn(PARAGUAY, 0)).toEqual([[0, 0, 0]]);
    const z8 = tilesIn(farmBbox, 8);
    expect(z8.length).toBeGreaterThanOrEqual(1);
    for (const [z, x, y] of tilesIn(PARAGUAY, 6)) {
      expect(z).toBe(6);
      expect(x).toBeLessThan(64);
      expect(y).toBeLessThan(64);
    }
    // más zoom, más teselas
    expect(tilesIn(PARAGUAY, 7).length).toBeGreaterThan(tilesIn(PARAGUAY, 6).length);
  });
});

describe("fondo del país", () => {
  it("país entero en zooms bajos y solo la zona de la estancia más arriba", () => {
    const plan = countryTilePlan(farmBbox);
    const at = (z: number) => plan.filter((t) => t[0] === z);
    expect(at(0)).toEqual([[0, 0, 0]]);
    expect(at(LIMITS.webOffline.countryFullZoom).length).toBe(tilesIn(PARAGUAY, LIMITS.webOffline.countryFullZoom).length);
    const max = LIMITS.webOffline.countryMaxZoom;
    expect(at(max).length).toBeGreaterThan(0);
    expect(at(max).length).toBeLessThan(tilesIn(PARAGUAY, max).length); // no es el país entero
    expect(Math.max(...plan.map((t) => t[0]))).toBeLessThanOrEqual(max);
  });
  it("las teselas de un zoom alto rodean la estancia", () => {
    const z = LIMITS.webOffline.countryMaxZoom;
    const near = countryTilePlan(farmBbox).filter((t) => t[0] === z);
    const x = lonToX(-55.92, z);
    const y = latToY(-27.17, z);
    expect(near.some((t) => t[1] === x && t[2] === y)).toBe(true);
  });
  it("respeta el tope de teselas descartando primero los zooms más altos", () => {
    const small = { ...LIMITS.webOffline, countryMaxTiles: 40 };
    const plan = countryTilePlan(farmBbox, small);
    expect(plan.length).toBeLessThanOrEqual(40);
    expect(plan.length).toBeGreaterThan(0);
    const top = Math.max(...plan.map((t) => t[0]));
    const full = countryTilePlan(farmBbox, { ...small, countryMaxTiles: 1_000_000 });
    // los niveles que entran están completos y el siguiente ya no entraba
    expect(plan).toEqual(full.filter((t) => t[0] <= top));
    expect(plan.length + full.filter((t) => t[0] === top + 1).length).toBeGreaterThan(40);
  });
  it("el plan por defecto es chico (cientos de teselas, no miles)", () => {
    const n = countryTilePlan(farmBbox).length;
    expect(n).toBeLessThan(LIMITS.webOffline.countryMaxTiles);
    expect(n * LIMITS.webOffline.countryTileBytesEstimate).toBeLessThan(60 * 1024 * 1024);
  });
});

describe("planFarm", () => {
  const farm = { id: "f1", minLon: farmBbox[0], minLat: farmBbox[1], maxLon: farmBbox[2], maxLat: farmBbox[3] };
  const layers = [
    layer("b-old", "true_color", 1, 1_000),
    layer("b-new", "true_color", 5, 4_000),
    layer("n-old", "ndvi", 2, 500),
    layer("n-new", "ndvi", 9, 2_000),
    layer("ndmi", "ndmi", 9, 99_999),
  ];
  const detail = { farm, layers } as never;

  it("elige el mapa base y el NDVI más nuevos y no los demás índices", () => {
    const p = planFarm(detail, "https://pub.r2.dev/");
    expect(p.files.map((f) => f.layerId)).toEqual(["b-new", "n-new"]);
    expect(p.files.map((f) => f.url)).toEqual(["https://pub.r2.dev/layers/f1/true_color-5.pmtiles", "https://pub.r2.dev/layers/f1/ndvi-9.pmtiles"]);
    expect(p.countryUrl).toBe(`https://pub.r2.dev/${COUNTRY_BASEMAP}`);
  });
  it("el tamaño estimado suma los archivos y las teselas del país", () => {
    const p = planFarm(detail, "https://pub.r2.dev");
    expect(p.estimateBytes).toBe(6_000 + p.tiles.length * LIMITS.webOffline.countryTileBytesEstimate);
  });
  it("sin imagen procesada igual arma el plan del país", () => {
    const p = planFarm({ farm, layers: [] } as never, "https://pub.r2.dev");
    expect(p.files).toEqual([]);
    expect(p.tiles.length).toBeGreaterThan(0);
  });
});

describe("tope de mapas guardados", () => {
  const plan = (bytes: number, url = "https://x/a.pmtiles") => ({ files: [{ url, bytes, layerId: "l", kind: "ndvi" as const }] }) as never;

  it("deja pasar lo que entra y rechaza lo que no, con los números", () => {
    expect(() => checkRoom(plan(100), {}, 1000)).not.toThrow();
    try {
      checkRoom(plan(600), { "https://x/otro": 500 }, 1000);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(OfflineQuotaError);
      expect((e as OfflineQuotaError).needBytes).toBe(1100);
      expect((e as OfflineQuotaError).maxBytes).toBe(1000);
    }
  });
  it("lo que ya está guardado no se cuenta dos veces (actualizar)", () => {
    expect(() => checkRoom(plan(900), { "https://x/a.pmtiles": 900 }, 1000)).not.toThrow();
  });
  it("sizeMap junta los archivos de todas las estancias", () => {
    expect(
      sizeMap({
        f1: { savedAt: 1, countryTiles: 0, files: [{ url: "u1", bytes: 10, layerId: "a" }] },
        f2: { savedAt: 1, countryTiles: 0, files: [{ url: "u1", bytes: 10, layerId: "a" }, { url: "u2", bytes: 5, layerId: "b" }] },
      }),
    ).toEqual({ u1: 10, u2: 5 });
  });
});
