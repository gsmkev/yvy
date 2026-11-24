import { describe, expect, it } from "vitest";
import { BRAND, RECORD_KINDS } from "@yvy/shared";
import { recordColor, recordGroup } from "./recordColors";

describe("recordColors", () => {
  it("todos los tipos tienen familia y color de la paleta", () => {
    const palette: string[] = Object.values(BRAND);
    for (const k of RECORD_KINDS) expect(palette).toContain(recordColor(k));
  });
  it("agrupa por familia", () => {
    expect(recordGroup("pest")).toBe("issue");
    expect(recordGroup("rain")).toBe("water");
    expect(recordGroup("weighing")).toBe("herd");
    expect(recordGroup("desconocido")).toBe("other");
  });
});
