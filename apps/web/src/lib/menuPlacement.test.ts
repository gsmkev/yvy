import { describe, expect, it } from "vitest";
import { placeMenu, type Box } from "./menuPlacement";

const box = (w: number, h: number, left = 0, top = 0): Box => ({ left, top, right: left + w, bottom: top + h });
const view = box(1000, 700);
const menu = { w: 192, h: 160 };
const at = (left: number, top: number, w = 40, h = 40): Box => ({ left, right: left + w, top, bottom: top + h });

describe("posición del menú", () => {
  it("con lugar de sobra queda como se pidió: alineado a la derecha del botón y hacia abajo", () => {
    expect(placeMenu(at(500, 100), menu, view)).toEqual({ align: "right", up: false });
    expect(placeMenu(at(500, 100), menu, view, "left")).toEqual({ align: "left", up: false });
  });

  it("si no entra hacia la izquierda, se alinea al borde izquierdo del botón", () => {
    expect(placeMenu(at(20, 100), menu, view)).toEqual({ align: "left", up: false });
  });

  it("si no entra hacia la derecha, se alinea al borde derecho", () => {
    expect(placeMenu(at(950, 100), menu, view, "left")).toEqual({ align: "right", up: false });
  });

  it("si no entra abajo, abre hacia arriba", () => {
    expect(placeMenu(at(500, 640), menu, view)).toEqual({ align: "right", up: true });
  });

  it("si tampoco entra arriba, queda abajo (el menú se desplaza por dentro)", () => {
    expect(placeMenu(at(500, 100), { w: 192, h: 900 }, view).up).toBe(false);
  });

  it("un panel con desplazamiento recorta el área: el menú no se abre hacia afuera del panel", () => {
    // panel a la derecha (x 960-1440): el botón está a 155 px del borde izquierdo del panel
    const panel = box(480, 800, 960, 0);
    expect(placeMenu(at(1115, 100), menu, panel).align).toBe("left");
  });

  it("con preferencia por arriba abre arriba si entra, y abajo si no", () => {
    expect(placeMenu(at(500, 400), menu, view, "right", 8, 4, true).up).toBe(true);
    expect(placeMenu(at(500, 50), menu, view, "right", 8, 4, true).up).toBe(false);
  });

  it("en un panel angosto elige el lado con más lugar", () => {
    const narrow = box(220, 700);
    expect(placeMenu(at(30, 100), menu, narrow).align).toBe("left");
    expect(placeMenu(at(150, 100), menu, narrow, "left").align).toBe("right");
  });
});
