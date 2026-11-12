// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const saved: { blob: Blob; name: string }[] = [];
vi.mock("../lib/exports", () => ({ download: (blob: Blob, name: string) => saved.push({ blob, name }) }));

import { parseEsNumber, safeName, tableFromElement } from "../lib/tableExport";
import { ExportableTable } from "./ExportableTable";

afterEach(() => {
  cleanup();
  saved.length = 0;
});

const readText = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsText(b);
  });

function Demo() {
  return (
    <ExportableTable name="hacienda / potreros">
      <table>
        <thead>
          <tr>
            <th>Potrero</th>
            <th>Cabezas</th>
            <th>Superficie</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Norte</td>
            <td>1.250</td>
            <td data-value="12.5">12,5 ha</td>
            <td>
              <button>Editar</button>
            </td>
          </tr>
          <tr>
            <td>=Sur</td>
            <td>0981 123</td>
            <td>—</td>
            <td>
              <button>Editar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </ExportableTable>
  );
}

describe("exportar cualquier tabla (U-28)", () => {
  it("parseEsNumber: números es-PY como números y códigos como texto", () => {
    expect(parseEsNumber("1.250")).toBe(1250);
    expect(parseEsNumber("1.234.567,89")).toBe(1234567.89);
    expect(parseEsNumber("-12")).toBe(-12);
    expect(parseEsNumber("0,75")).toBe(0.75);
    expect(parseEsNumber("0981 123")).toBeNull();
    expect(parseEsNumber("007")).toBeNull();
    expect(parseEsNumber("12 ha")).toBeNull();
    expect(parseEsNumber("1.25")).toBeNull();
    expect(parseEsNumber("")).toBeNull();
  });

  it("safeName saca lo que Excel no admite en el nombre de una hoja", () => {
    expect(safeName("Costo / ha [2026]: lotes?")).toBe("Costo - ha -2026-- lotes-");
    expect(safeName("   ")).toBe("tabla");
  });

  it("tableFromElement lee encabezados y filas, deja afuera las columnas sin encabezado y usa data-value", () => {
    const host = document.createElement("div");
    host.innerHTML = `<table><thead><tr><th>A</th><th>B</th><th></th></tr></thead><tbody><tr><td>x</td><td data-value="3.5">3,5</td><td><button>ok</button></td></tr></tbody><tfoot><tr><td>Total</td><td>10</td><td></td></tr></tfoot></table>`;
    expect(tableFromElement(host.querySelector("table")!, "t")).toEqual({
      name: "t",
      headers: ["A", "B"],
      rows: [
        ["x", 3.5],
        ["Total", 10],
      ],
    });
  });

  it("el botón CSV baja lo que se ve en pantalla, con números como números y fórmulas neutralizadas", async () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toMatch(/^hacienda - potreros-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = (await readText(saved[0]!.blob)).replace(/^\uFEFF/, "");
    expect(csv).toBe("Potrero,Cabezas,Superficie\r\nNorte,1250,12.5\r\n'=Sur,0981 123,—");
  });

  it("el botón Excel genera un .xlsx", async () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole("button", { name: "Exportar Excel" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toMatch(/\.xlsx$/);
    expect(saved[0]!.blob.size).toBeGreaterThan(1000);
  });
});
