// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionMenu, ExportMenu } from "./menus";
import { Button, DateInput, EmptyState, Input, PageHeader, Tabs } from "./ui";

afterEach(cleanup);

async function violations(node: Element) {
  const r = await axe.run(node, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

describe("ActionMenu", () => {
  const setup = () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <ActionMenu
        label="Más acciones"
        items={[
          { label: "Importar", onSelect: a },
          { label: "Agregar punto", onSelect: b },
          false,
          { label: "Parte semanal", onSelect: vi.fn() },
        ]}
      />,
    );
    return { a, b, trigger: screen.getByRole("button", { name: "Más acciones" }) };
  };

  it("abre con el botón, enfoca el primer ítem y cierra al elegir", () => {
    const { a, trigger } = setup();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Importar" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Importar" }));
    expect(a).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("con teclado: flecha abajo abre, flechas recorren, letra salta, Escape cierra y devuelve el foco", () => {
    const { trigger } = setup();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Agregar punto" }));
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Parte semanal" }));
    fireEvent.keyDown(menu, { key: "i" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Importar" }));
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("cierra al hacer clic afuera y no tiene infracciones de axe", async () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(await violations(document.body)).toEqual([]);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("sin ítems no dibuja nada", () => {
    const { container } = render(<ActionMenu label="Más" items={[false, null]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ExportMenu", () => {
  it("un botón Exportar con un ítem por formato", async () => {
    const csv = vi.fn();
    render(
      <ExportMenu
        formats={[
          { label: "Excel (.xlsx)", run: vi.fn() },
          { label: "CSV", run: csv },
        ]}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
    await waitFor(() => expect(csv).toHaveBeenCalledOnce());
  });
});

describe("Tabs", () => {
  it("marca la pestaña activa y las flechas pasan a la siguiente", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        value="a"
        onChange={onChange}
        tabs={[
          { id: "a", label: "Lotes", count: 9 },
          { id: "b", label: "Campañas" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: /Lotes/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("PageHeader y EmptyState", () => {
  it("el título lleva el texto completo en el tooltip y se trunca en una línea", async () => {
    const { container } = render(
      <PageHeader title="Estancia San Pedro del Paraná" primary={<Button variant="primary">Nuevo lote</Button>} menu={<ActionMenu label="Más" items={[{ label: "Imprimir", onSelect: () => {} }]} />} />,
    );
    const h = screen.getByRole("heading", { level: 1 });
    expect(h.getAttribute("title")).toBe("Estancia San Pedro del Paraná");
    expect(h.className).toContain("truncate");
    expect(await violations(container)).toEqual([]);
  });

  it("el vacío dice qué es y ofrece la acción", () => {
    render(<EmptyState title="Todavía no hay lotes" action={<Button variant="primary">Nuevo lote</Button>}>Un lote es una parcela con su cultivo.</EmptyState>);
    expect(screen.getByText("Todavía no hay lotes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuevo lote" })).toBeTruthy();
  });
});

describe("DateInput", () => {
  function Demo({ initial = "" }: { initial?: string }) {
    const [v, setV] = useState(initial);
    return (
      <>
        <label>
          Vence
          <DateInput value={v} onValueChange={setV} />
        </label>
        <output data-testid="iso">{v}</output>
      </>
    );
  }

  it("muestra dd/mm/aaaa y entrega ISO", () => {
    render(<Demo initial="2026-11-12" />);
    const input = screen.getByLabelText("Vence") as HTMLInputElement;
    expect(input.value).toBe("12/11/2026");
    fireEvent.change(input, { target: { value: "01032027" } });
    expect(input.value).toBe("01/03/2027");
    expect(screen.getByTestId("iso").textContent).toBe("2027-03-01");
  });

  it("una fecha incompleta o inexistente deja el valor vacío y el campo inválido", () => {
    render(<Demo initial="2026-11-12" />);
    const input = screen.getByLabelText("Vence") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3102" } });
    expect(screen.getByTestId("iso").textContent).toBe("");
    expect(input.validity.valid).toBe(false);
  });

  it("Input type=date usa el mismo campo y los formularios siguen leyendo e.target.value", () => {
    const seen: string[] = [];
    render(<Input aria-label="Fecha" type="date" value="" onChange={(e) => seen.push(e.target.value)} />);
    const input = screen.getByLabelText("Fecha") as HTMLInputElement;
    expect(input.type).toBe("text");
    fireEvent.change(input, { target: { value: "12112026" } });
    expect(seen).toEqual(["2026-11-12"]);
  });
});
