// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, DataTable, DateRange, Field, FilterBar, Form, FormFooter, Input, Modal, Select, Stat, StatRow, Tabs, type Column } from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Simula la pantalla del celular (bajo 640 px) o de escritorio. */
function stubWidth(phone: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("max-width: 639px") ? phone : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("FilterBar", () => {
  const bar = (
    <FilterBar active={2}>
      <Field label="Estancia">
        <Select value="" onChange={() => {}} options={[{ value: "", label: "Todas" }]} />
      </Field>
    </FilterBar>
  );
  it("en escritorio muestra los filtros en la fila, sin botón Filtros", () => {
    stubWidth(false);
    render(bar);
    expect(screen.getByText("Estancia")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Filtros/ })).toBeNull();
  });
  it("en el celular los filtros están en una hoja que abre el botón Filtros, con el contador", () => {
    stubWidth(true);
    render(bar);
    expect(screen.queryByText("Estancia")).toBeNull();
    const open = screen.getByRole("button", { name: /Filtros/ });
    expect(open.textContent).toContain("2");
    fireEvent.click(open);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Estancia")).toBeTruthy();
  });
});

describe("DateRange", () => {
  it("entrega el período completo al cambiar una de las dos fechas", () => {
    const seen: { from: string; to: string }[] = [];
    render(<DateRange from="" to="2026-03-10" onChange={(r) => seen.push(r)} />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "01032026" } });
    expect(seen.at(-1)).toEqual({ from: "2026-03-01", to: "2026-03-10" });
  });
});

describe("StatRow", () => {
  it("reparte hasta cuatro cifras por fila", () => {
    const { container } = render(
      <StatRow>
        <Stat label="A" value="1" />
        <Stat label="B" value="2" />
        <Stat label="C" value="3" />
        <Stat label="D" value="4" />
        <Stat label="E" value="5" />
      </StatRow>,
    );
    expect(container.firstElementChild?.className).toContain("sm:grid-cols-4");
  });
});

describe("Tabs", () => {
  it("dibuja el indicador de la pestaña activa y las acciones a la derecha", () => {
    render(<Tabs value="a" onChange={() => {}} tabs={[{ id: "a", label: "Uno" }, { id: "b", label: "Dos" }]} actions={<Button size="sm">Nuevo</Button>} />);
    expect(screen.getByTestId("tab-indicator")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeTruthy();
  });
});

describe("DataTable en el celular", () => {
  interface Row {
    id: string;
    name: string;
    detail: string;
    amount: string;
  }
  const cols: Column<Row>[] = [
    { id: "name", header: "Nombre", cell: (r) => r.name },
    { id: "detail", header: "Detalle", cell: (r) => r.detail },
    { id: "amount", header: "Monto", align: "right", cell: (r) => r.amount },
  ];
  const rows = [{ id: "1", name: "Semilla", detail: "Depósito norte", amount: "Gs. 100" }];
  it("pasa a tarjetas con título, línea secundaria y dato clave, y deja la tabla oculta para exportar", () => {
    stubWidth(true);
    const { container } = render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />);
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.querySelector("li")?.textContent).toContain("Depósito norte");
    expect(container.querySelector("table")?.closest("div")?.className).toContain("hidden");
  });
  it("en escritorio es una tabla", () => {
    stubWidth(false);
    const { container } = render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />);
    expect(container.querySelector("li")).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("Modal", () => {
  it("el pie del formulario es fijo con Cancelar y la acción principal, y Cancelar cierra tras la salida", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    render(
      <Modal title="Nuevo" onClose={onClose}>
        <Form onSubmit={onSubmit}>
          <Field label="Nombre">
            <Input />
          </Field>
          <FormFooter error={null} disabled={false} label="Crear" />
        </Form>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(130));
    expect(onClose).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
