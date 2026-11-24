import { describe, expect, it } from "vitest";
import { PLACES_PY, searchPlaces } from "./places-py";

describe("places-py", () => {
  it("incluye los 17 departamentos y Asunción", () => {
    expect(PLACES_PY.filter((p) => p.kind === "department")).toHaveLength(18);
  });
  it("todas las coordenadas caen dentro de Paraguay", () => {
    for (const p of PLACES_PY) {
      expect(p.lon).toBeGreaterThan(-62.7);
      expect(p.lon).toBeLessThan(-54.2);
      expect(p.lat).toBeGreaterThan(-27.7);
      expect(p.lat).toBeLessThan(-19.2);
    }
  });
  it("busca sin tildes ni mayúsculas", () => {
    expect(searchPlaces("concepcion")[0]?.name).toBe("Concepción");
    expect(searchPlaces("ENCARNACION")[0]?.department).toBe("Itapúa");
    expect(searchPlaces("x")).toEqual([]);
  });
});
