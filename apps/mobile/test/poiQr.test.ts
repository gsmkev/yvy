import { describe, expect, it } from "vitest";
import { POI_KINDS } from "@yvy/shared";
import { kindForPoi } from "../src/lib/poiQr";

describe("anotar en un punto escaneado (F-28)", () => {
  it("el pluviómetro abre Lluvia y la aguada o el bebedero abren su nivel", () => {
    expect(kindForPoi("rain_gauge")).toBe("rain");
    expect(kindForPoi("water")).toBe("water");
    expect(kindForPoi("trough")).toBe("water");
  });

  it("los demás puntos preguntan qué anotar", () => {
    for (const k of POI_KINDS.filter((x) => !["rain_gauge", "water", "trough"].includes(x))) expect(kindForPoi(k)).toBeNull();
  });
});
