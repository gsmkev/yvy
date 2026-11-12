/** Flujos de la app de ganadería, segunda tanda (gan-p2). */
import { describe, expect, it } from "vitest";
import { parseRecordData } from "@yvy/shared";
import { FLOWS, KINDS_FOR, SINGLE_PLOT_KINDS, stepsFor } from "../src/lib/annotate";

const keys = (kind: Parameters<typeof stepsFor>[0], a: Record<string, unknown> = {}) =>
  stepsFor(kind, a, { waterPois: 0 }).map((s) => s.key);

describe("G-13 abigeato", () => {
  it("el flujo es categoría, cabezas y denuncia opcional; es de un solo potrero y de potreros", () => {
    expect(keys("theft")).toEqual(["category", "head", "policeReport"]);
    expect(FLOWS.theft.at(-1)).toMatchObject({ key: "policeReport", optional: true });
    expect(KINDS_FOR("pasture")).toContain("theft");
    expect(KINDS_FOR("crop")).not.toContain("theft");
    expect(SINGLE_PLOT_KINDS).toContain("theft");
  });

  it("lo que arma el flujo valida con el esquema compartido", () => {
    expect(parseRecordData("theft", { category: "vaca", head: 2 }).success).toBe(true);
    expect(parseRecordData("theft", { category: "vaca", head: 2, policeReport: "D-1", reportedAt: 1 }).success).toBe(true);
    expect(parseRecordData("theft", { category: "vaca", head: 0 }).success).toBe(false);
  });
});

describe("G-31 suplementación", () => {
  it("el flujo es tipo y kilos, y se ofrece en potreros", () => {
    expect(keys("supplement")).toEqual(["type", "kg", "note"]);
    expect(KINDS_FOR("pasture")).toContain("supplement");
    expect(KINDS_FOR("crop")).not.toContain("supplement");
    expect(SINGLE_PLOT_KINDS).toContain("supplement");
    expect(parseRecordData("supplement", { type: "sal_mineral", kg: 25 }).success).toBe(true);
    expect(parseRecordData("supplement", { type: "sal_mineral", kg: -1 }).success).toBe(false);
  });
});
