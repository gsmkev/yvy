import { describe, expect, it } from "vitest";
import { ADMIN_GROUPS } from "./adminNav";

describe("ADMIN_GROUPS", () => {
  const ids = ADMIN_GROUPS.flatMap((g) => g.sections);
  it("no repite secciones", () => expect(new Set(ids).size).toBe(ids.length));
  it("ningún grupo tiene más de 6 ítems", () => {
    for (const g of ADMIN_GROUPS) expect(g.sections.length).toBeLessThanOrEqual(6);
  });
});
