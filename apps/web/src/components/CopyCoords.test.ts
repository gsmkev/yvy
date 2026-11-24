import { describe, expect, it } from "vitest";
import { fmtCoords } from "./CopyCoords";

describe("fmtCoords", () => {
  it("latitud primero, 5 decimales, punto decimal", () => {
    expect(fmtCoords(-57.634561, -25.281234)).toBe("-25.28123, -57.63456");
  });
});
