import { describe, expect, it } from "vitest";
import { ageText, fmtNumber, parseDecimal } from "../src/office/format";
import { barFractions, buildChart, niceMax, segmentPath } from "../src/office/chartMath";
import { groupMenu, type OfficeMenuItem } from "../src/office/menuLogic";

describe("formatos", () => {
  it("edad", () => {
    expect(ageText(10_000)).toBe("un momento");
    expect(ageText(5 * 60_000)).toBe("5 min");
    expect(ageText(2 * 3_600_000 + 5)).toBe("2 h");
    expect(ageText(3 * 86_400_000)).toBe("3 d");
  });
  it("números es-PY", () => {
    expect(fmtNumber(1234.5)).toBe("1.234,5");
    expect(fmtNumber(12)).toBe("12");
    expect(fmtNumber(0.04)).toBe("0");
    expect(fmtNumber(-3.25, 2)).toBe("-3,25");
  });
  it("parseDecimal acepta coma y punto", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal("1.250,5")).toBe(1250.5);
    expect(parseDecimal("1.250")).toBe(1250);
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("")).toBeNull();
  });
});

describe("gráficos", () => {
  it("niceMax y barras", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(73)).toBe(100);
    expect(niceMax(4.2)).toBe(5);
    expect(barFractions([5, 10, 0, -2])).toEqual([0.5, 1, 0, 0]);
    expect(barFractions([0, 0])).toEqual([0, 0]);
  });
  it("línea con hueco parte el trazo; x de texto va por orden", () => {
    const m = buildChart([{ label: "a", color: "#000", points: [{ x: "1", y: 1 }, { x: "2", y: null }, { x: "3", y: 2 }] }]);
    expect(m.lines[0]!.segments).toHaveLength(2);
    expect(m.xs.map((x) => x.label)).toEqual(["1", "2", "3"]);
    expect(m.yMax).toBe(2);
    expect(buildChart([{ label: "a", color: "#000", points: [{ x: 1, y: null }] }]).empty).toBe(true);
    expect(segmentPath([{ x: 0, y: 0 }, { x: 1, y: 1 }], 10, 0, 100, 50)).toBe("M10.0 50.0 L110.0 0.0");
  });
});

describe("menú de Gestión", () => {
  const I = (id: string, group: OfficeMenuItem["group"], show?: OfficeMenuItem["show"]): OfficeMenuItem => ({ id, group, title: "ui.alerts.title", icon: null as never, href: `/office/${id}`, show });
  const ctx = { role: "owner", farms: 1, plots: 0, hasClients: false };
  it("agrupa, respeta el orden y oculta grupos vacíos", () => {
    const g = groupMenu([I("a", "admin"), I("b", "campo"), I("c", "campo", (c) => c.hasClients)], ctx);
    expect(g.map((x) => x.group)).toEqual(["campo", "admin"]);
    expect(g[0]!.items.map((i) => i.id)).toEqual(["b"]);
    expect(groupMenu([I("c", "campo", (c) => c.plots > 0)], ctx)).toEqual([]);
  });
});
