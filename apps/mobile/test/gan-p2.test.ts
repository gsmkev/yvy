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

describe("G-22 pesadas", () => {
  it("con caravana no se pregunta el lote ni las cabezas; sin caravana sí", () => {
    expect(keys("weighing")).toEqual(["kg", "tag", "group", "head"]);
    expect(keys("weighing", { tag: "PY-1" })).toEqual(["kg", "tag"]);
    expect(FLOWS.weighing.find((s) => s.key === "tag")).toMatchObject({ optional: true });
    const tag = FLOWS.weighing.find((s) => s.key === "tag");
    expect(tag?.kind === "text" && tag.pattern?.test("PY-0012")).toBe(true);
    expect(tag?.kind === "text" && tag.pattern?.test("PY 0012")).toBe(false);
  });
  it("se ofrece en potreros y sin lote, y es de un solo potrero", () => {
    expect(KINDS_FOR("pasture")).toContain("weighing");
    expect(KINDS_FOR(null)).toContain("weighing");
    expect(SINGLE_PLOT_KINDS).toContain("weighing");
  });
});

describe("G-20 reproducción", () => {
  it("el flujo cambia según el evento y con caravana no pregunta cabezas", () => {
    expect(keys("reproduction", { event: "service" })).toEqual(["event", "tag", "head", "method"]);
    expect(keys("reproduction", { event: "pregnancy_check" })).toEqual(["event", "tag", "head", "pregnant"]);
    expect(keys("reproduction", { event: "calving" })).toEqual(["event", "tag", "head", "calves"]);
    expect(keys("reproduction", { event: "weaning" })).toEqual(["event", "tag", "head"]);
    expect(keys("reproduction", { event: "pregnancy_check", tag: "PY-1" })).toEqual(["event", "tag", "pregnant"]);
    // El destete pregunta por terneros, no por vacas.
    const q = (a: Record<string, unknown>) => stepsFor("reproduction", a, { waterPois: 0 }).find((s) => s.key === "head")?.question;
    expect(q({ event: "weaning" })).toBe("app.reproWeanedQuestion");
    expect(q({ event: "service" })).toBe("app.reproHeadQuestion");
  });
  it("se ofrece en potreros y sin lote", () => {
    expect(KINDS_FOR("pasture")).toContain("reproduction");
    expect(KINDS_FOR(null)).toContain("reproduction");
    expect(SINGLE_PLOT_KINDS).toContain("reproduction");
  });
});
