import { describe, expect, it } from "vitest";
import { POI_KINDS } from "@yvy/shared";
import { POI_ICON } from "./icons";
import { poiImageId } from "./poiMarkers";

describe("íconos de puntos de interés (M-19)", () => {
  it("cada tipo tiene su propio ícono", () => {
    for (const k of POI_KINDS) expect(POI_ICON[k]).toBeTruthy();
    expect(new Set(POI_KINDS.map((k) => POI_ICON[k])).size).toBe(POI_KINDS.length);
  });

  it("el id de imagen del mapa es poi-<tipo>", () => {
    expect(poiImageId("silo")).toBe("poi-silo");
  });
});
