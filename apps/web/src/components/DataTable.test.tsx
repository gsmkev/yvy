// @vitest-environment jsdom
/** Pruebas de dataTable. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DataTable, type Column } from "./ui";

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
  ha: number;
}
const rows: Row[] = [
  { id: "a", name: "Lote B", ha: 20 },
  { id: "b", name: "Lote A", ha: 50 },
];
const columns: Column<Row>[] = [
  { id: "name", header: "Lote", cell: (r) => r.name, sort: (a, b) => a.name.localeCompare(b.name) },
  { id: "ha", header: "ha", align: "right", cell: (r) => r.ha },
];
const names = () => screen.getAllByRole("row").slice(1).map((r) => r.textContent);

describe("DataTable", () => {
  it("ordena por clic en el encabezado y marca aria-sort", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(names()).toEqual(["Lote B20", "Lote A50"]);
    fireEvent.click(screen.getByRole("button", { name: /Lote/ }));
    expect(names()).toEqual(["Lote A50", "Lote B20"]);
    expect(screen.getByRole("columnheader", { name: /Lote/ }).getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(screen.getByRole("button", { name: /Lote/ }));
    expect(names()).toEqual(["Lote B20", "Lote A50"]);
    expect(screen.getByRole("columnheader", { name: /Lote/ }).getAttribute("aria-sort")).toBe("descending");
  });
  it("sin filas muestra el vacío", () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty={<p>Nada por acá</p>} />);
    expect(screen.getByText("Nada por acá")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
