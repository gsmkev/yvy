import { describe, expect, it } from "vitest";
import { placeLabels } from "./labelLayout";

const label = { x: 200, y: 200, w: 80, h: 16 };

describe("etiquetas sin choques", () => {
  it("sin íconos cerca la etiqueta queda en el centro", () => {
    expect(placeLabels([label], [{ x: 20, y: 20, r: 13 }])).toEqual([{ dx: 0, dy: 0, hidden: false }]);
  });

  it("con un ícono justo en el centro, la etiqueta se corre arriba y ya no lo pisa", () => {
    const [p] = placeLabels([label], [{ x: 200, y: 200, r: 13 }]);
    expect(p!.hidden).toBe(false);
    expect(p!.dy).toBeLessThan(0);
    // el rectángulo corrido queda fuera del círculo
    expect(200 + p!.dy + label.h / 2).toBeLessThan(200 - 13);
  });

  it("si arriba también hay un ícono prueba abajo", () => {
    const [p] = placeLabels([label], [{ x: 200, y: 200, r: 13 }, { x: 200, y: 180, r: 13 }]);
    expect(p!.dy).toBeGreaterThan(0);
  });

  it("dos etiquetas que se pisan: la segunda se mueve o se oculta, nunca se superponen", () => {
    const out = placeLabels([label, { ...label, x: 210 }], []);
    expect(out[0]).toEqual({ dx: 0, dy: 0, hidden: false });
    expect(out[1]!.hidden || out[1]!.dx !== 0 || out[1]!.dy !== 0).toBe(true);
  });

  it("si no hay lugar en ningún lado, se oculta", () => {
    const wall = [-60, -30, 0, 30, 60].flatMap((dx) => [-40, -20, 0, 20, 40].map((dy) => ({ x: 200 + dx, y: 200 + dy, r: 13 })));
    expect(placeLabels([label], wall)[0]!.hidden).toBe(true);
  });
});
