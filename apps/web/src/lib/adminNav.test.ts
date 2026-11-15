import { describe, expect, it } from "vitest";
import { ADMIN_GROUPS, groupOf } from "./adminNav";

describe("ADMIN_GROUPS", () => {
  const ids = ADMIN_GROUPS.flatMap((g) => g.sections);
  it("no repite secciones", () => expect(new Set(ids).size).toBe(ids.length));
  it("tiene 5 módulos y 24 secciones", () => {
    expect(ADMIN_GROUPS).toHaveLength(5);
    expect(ids).toHaveLength(24);
  });
  it("ningún módulo tiene más de 7 secciones", () => {
    for (const g of ADMIN_GROUPS) expect(g.sections.length).toBeLessThanOrEqual(7);
  });
  it("abre por Resumen y encuentra el módulo de una sección", () => {
    expect(ADMIN_GROUPS[0]!.sections[0]).toBe("overview");
    expect(groupOf("fuel").id).toBe("stock");
    expect(groupOf("zzz").id).toBe("overview");
    expect(groupOf(undefined).id).toBe("overview");
  });
});
