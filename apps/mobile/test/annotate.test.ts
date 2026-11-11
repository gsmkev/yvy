import { describe, expect, it } from "vitest";
import { FLOWS, KINDS_FOR, SINGLE_PLOT_KINDS, stepsFor } from "../src/lib/annotate";

const keys = (kind: Parameters<typeof stepsFor>[0], a: Record<string, unknown> = {}, waterPois = 0) =>
  stepsFor(kind, a, { waterPois }).map((s) => s.key);

describe("flujos de ganadería y aguadas", () => {
  it("movimiento: rotación pregunta el destino; venta y compra no", () => {
    expect(keys("herd_move", { reason: "rotacion" })).toEqual(["reason", "toPlotId", "counts"]);
    expect(keys("herd_move", { reason: "venta" })).toEqual(["reason", "counts"]);
    expect(keys("herd_move", { reason: "compra" })).toEqual(["reason", "counts"]);
  });

  it("agua: pregunta cuál aguada solo si la estancia tiene aguadas", () => {
    expect(keys("water", {}, 0)).toEqual(["level", "note"]);
    expect(keys("water", {}, 2)).toEqual(["poiId", "level", "note"]);
  });

  it("los registros de hacienda se ofrecen en potreros y son de un solo potrero", () => {
    for (const k of ["herd_count", "herd_move", "mortality"] as const) {
      expect(KINDS_FOR("pasture")).toContain(k);
      expect(KINDS_FOR("crop")).not.toContain(k);
      expect(SINGLE_PLOT_KINDS).toContain(k);
    }
    expect(KINDS_FOR(null)).toContain("health");
  });

  it("todo tipo de registro tiene flujo", () => {
    for (const k of ["herd_count", "herd_move", "mortality", "health"] as const) expect(FLOWS[k].length).toBeGreaterThan(0);
  });
});
