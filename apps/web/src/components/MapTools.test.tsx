// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerSwitch, LayersPanel, MapToolbar, PanelSection } from "./MapTools";

afterEach(cleanup);

describe("barra de herramientas del mapa", () => {
  const setup = (over: Partial<Parameters<typeof MapToolbar>[0]> = {}) => {
    const p = { onMeasure: vi.fn(), onLayers: vi.fn(), onZoom: vi.fn() };
    const view = render(
      <MapToolbar measuring={false} layersOpen={false} fullscreen={<button aria-label="Pantalla completa">f</button>} {...p} {...over} />,
    );
    return { p, view };
  };

  it("cada botón es un ícono con nombre accesible y tooltip", () => {
    setup();
    for (const name of ["Acercar", "Alejar", "Medir", "Capas"]) {
      const b = screen.getByRole("button", { name });
      expect(b.getAttribute("title")).toBe(name);
    }
    expect(screen.getByRole("toolbar", { name: "Herramientas del mapa" })).toBeTruthy();
  });

  it("zoom, medir y capas avisan; medir y capas reflejan su estado", () => {
    const { p } = setup({ measuring: true, layersOpen: true });
    fireEvent.click(screen.getByRole("button", { name: "Acercar" }));
    fireEvent.click(screen.getByRole("button", { name: "Alejar" }));
    expect(p.onZoom.mock.calls).toEqual([[1], [-1]]);
    fireEvent.click(screen.getByRole("button", { name: "Medir" }));
    fireEvent.click(screen.getByRole("button", { name: "Capas" }));
    expect(p.onMeasure).toHaveBeenCalledOnce();
    expect(p.onLayers).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Medir" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Capas" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("sin infracciones de axe", async () => {
    const { view } = setup();
    const r = await axe.run(view.container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("panel Capas", () => {
  it("las secciones se pliegan y las capas se encienden con aria-pressed", () => {
    const toggle = vi.fn();
    render(
      <LayersPanel>
        <PanelSection title="Fondo">contenido del fondo</PanelSection>
        <PanelSection title="Plagas" defaultOpen={false}>
          <LayerSwitch label="Ver plagas" on={false} onToggle={toggle} />
        </PanelSection>
      </LayersPanel>,
    );
    expect(screen.getByText("contenido del fondo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ver plagas" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fondo" }));
    expect(screen.queryByText("contenido del fondo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Plagas" }));
    const sw = screen.getByRole("button", { name: "Ver plagas" });
    expect(sw.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(sw);
    expect(toggle).toHaveBeenCalledOnce();
  });
});
