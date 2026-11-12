import { describe, expect, it } from "vitest";
import { parseAcademyVideos } from "./academy";

describe("Academia (V-10)", () => {
  it("sin configurar no hay videos", () => {
    expect(parseAcademyVideos(undefined)).toEqual({});
    expect(parseAcademyVideos("")).toEqual({});
    expect(parseAcademyVideos("no es json")).toEqual({});
    expect(parseAcademyVideos("[1,2]")).toEqual({});
  });

  it("acepta un enlace por tema o uno por idioma, solo https y solo temas conocidos", () => {
    const r = parseAcademyVideos(
      JSON.stringify({
        map: "https://youtu.be/abc",
        record: { es: "https://example.com/es", gn: "https://example.com/gn" },
        offline: "http://inseguro.example.com",
        tasks: "javascript:alert(1)",
        alerts: { es: 42, gn: "https://example.com/gn" },
        inventado: "https://example.com/x",
      }),
    );
    expect(r).toEqual({
      map: { es: "https://youtu.be/abc" },
      record: { es: "https://example.com/es", gn: "https://example.com/gn" },
      alerts: { gn: "https://example.com/gn" },
    });
  });
});
