import { describe, expect, it } from "vitest";
import { arrowHead, circleRadius, fitContain, flattenSize, isMeaningful, normalize, undo, type Mark } from "../src/lib/markup";

describe("dibujo sobre la foto (F-08)", () => {
  it("ajusta la foto a la caja sin deformarla", () => {
    expect(fitContain(4000, 3000, 400, 800)).toEqual({ width: 400, height: 300 });
    expect(fitContain(3000, 4000, 400, 400)).toEqual({ width: 300, height: 400 });
    expect(fitContain(0, 10, 10, 10)).toEqual({ width: 0, height: 0 });
  });

  it("aplana a 1280 de lado largo sin agrandar", () => {
    expect(flattenSize(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(flattenSize(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it("normaliza y recorta a la foto", () => {
    expect(normalize(50, 25, 100, 50)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalize(-10, 999, 100, 50)).toEqual({ x: 0, y: 1 });
  });

  it("ignora toques sin arrastre", () => {
    expect(isMeaningful({ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.5 }, 400, 300)).toBe(false);
    expect(isMeaningful({ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 }, 400, 300)).toBe(true);
  });

  it("calcula el radio del círculo en píxeles", () => {
    expect(circleRadius({ x: 0.5, y: 0.5 }, { x: 0.75, y: 0.5 }, 400, 300)).toBe(100);
  });

  it("la cabeza de la flecha queda detrás de la punta, simétrica", () => {
    const [a, b] = arrowHead({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, 400, 400, 40);
    expect(a.x).toBeLessThan(400);
    expect(b.x).toBeLessThan(400);
    expect(a.y + b.y).toBeCloseTo(400, 5); // simétricas respecto de y = 200
  });

  it("deshace la última marca", () => {
    const m: Mark[] = [
      { kind: "arrow", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
      { kind: "circle", center: { x: 0.5, y: 0.5 }, edge: { x: 0.6, y: 0.5 } },
    ];
    expect(undo(m)).toHaveLength(1);
    expect(undo([])).toEqual([]);
  });
});
