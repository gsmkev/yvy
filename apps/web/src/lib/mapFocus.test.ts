import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("foco visible en el mapa (U-26)", () => {
  it("el lienzo no pierde el foco del teclado: se marca el borde del mapa entero", () => {
    const sel = ".maplibregl-map:has(.maplibregl-canvas:focus-visible)::after";
    expect(css).toContain(sel);
    const rule = css.split(sel)[1]!.split("}")[0]!;
    expect(rule).toMatch(/border:\s*4px solid var\(--color-accion\)/);
    expect(rule).toMatch(/pointer-events:\s*none/);
  });
});
