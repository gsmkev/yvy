import { describe, expect, it } from "vitest";
import { FLOWS, visibleSteps } from "../src/lib/annotate";

describe("cierre de la orden: consumo real (E-21)", () => {
  const keys = (kind: "application" | "fertilization", a: Record<string, unknown>) =>
    visibleSteps(FLOWS[kind], a, { askSeason: false }).map((s) => `${s.kind}:${s.key}`);
  it("el paso de cantidades gastadas solo aparece si el registro cierra una orden", () => {
    expect(keys("application", {})).not.toContain("usage:products");
    expect(keys("application", { orderTaskId: "x" })).toContain("usage:products");
    expect(keys("fertilization", {})).not.toContain("usage:products");
    expect(keys("fertilization", { orderTaskId: "x" })).toContain("usage:products");
  });
});
