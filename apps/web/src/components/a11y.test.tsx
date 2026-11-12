// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Preferences } from "./Preferences";
import { Button, ConfirmModal, Field, Input, Modal, Select, Tabs } from "./ui";

afterEach(cleanup);

async function violations(node: Element) {
  // jsdom no calcula colores (el contraste se revisa a mano, ver styles.css) y "region" es de página completa
  const r = await axe.run(node, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

function Demo() {
  const [tab, setTab] = useState<"a" | "b">("a");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "a", label: "Lotes" },
          { id: "b", label: "Registros" },
        ]}
      />
      <Field label="Estancia">
        <Select value="" onChange={() => {}} options={[{ value: "", label: "Todas" }]} />
      </Field>
      <Button onClick={() => setOpen(true)}>Abrir</Button>
      {open && (
        <Modal title="Nuevo lote" onClose={() => setOpen(false)}>
          <Field label="Nombre">
            <Input />
          </Field>
          <Button>Guardar</Button>
        </Modal>
      )}
    </div>
  );
}

describe("accesibilidad", () => {
  it("las pantallas base no tienen infracciones de axe", async () => {
    const { container } = render(<Demo />);
    expect(await violations(container)).toEqual([]);
    fireEvent.click(screen.getByText("Abrir"));
    expect(await violations(document.body)).toEqual([]);
  });

  it("el diálogo enfoca su primer campo, cierra con Escape y devuelve el foco", () => {
    render(<Demo />);
    const opener = screen.getByText("Abrir");
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Nuevo lote" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Nombre"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("la confirmación no enfoca la acción destructiva", () => {
    render(<ConfirmModal title="Borrar" message="¿Seguro?" confirmLabel="Borrar lote" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("Tab se queda dentro del diálogo", () => {
    render(<Demo />);
    fireEvent.click(screen.getByText("Abrir"));
    const save = screen.getByText("Guardar");
    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Cerrar"));
  });

  it("Preferencias: grupos de opciones con leyenda y sin infracciones", async () => {
    const { container } = render(<Preferences />);
    expect(screen.getAllByRole("group").length).toBeGreaterThanOrEqual(4);
    expect(await violations(container)).toEqual([]);
  });
});
