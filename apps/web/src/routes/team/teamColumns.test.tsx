// @vitest-environment jsdom
/** Pruebas de la columna "Última conexión" del equipo. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member } from "../../lib/types";
import { teamColumns } from "./teamColumns";

afterEach(cleanup);

const member = (lastSyncAt: number | null) =>
  ({ userId: "u", fullName: "Ana", role: "worker", lastSyncAt, overdueTasks: 0, records7d: 0, plotsVisited7d: 0 }) as unknown as Member;
const ctx = { owner: false, canManage: false, meId: "x", farmsOf: () => "", onAssign: vi.fn(), onScope: vi.fn(), onLink: vi.fn(), onPin: vi.fn(), onRemove: vi.fn() };

describe("teamColumns", () => {
  const col = teamColumns(ctx).find((c) => c.id === "last")!;

  it("existe siempre y no se oculta en el celular", () => {
    expect(col.header).toBe("Última conexión");
    expect(col.hideBelow).toBeUndefined();
  });

  it("dice Nunca cuando no hay conexión y no repite el texto largo", () => {
    render(<div>{col.cell(member(null))}</div>);
    expect(screen.getByText(/Nunca/)).toBeTruthy();
    expect(screen.queryByText(/Todavía no se conectó/)).toBeNull();
  });

  it("muestra hace cuánto cuando hay conexión", () => {
    render(<div>{col.cell(member(Date.now() - 3 * 3_600_000))}</div>);
    expect(screen.getByText(/hace 3/)).toBeTruthy();
  });

  it("ordena de menos a más reciente", () => {
    expect(col.sort!(member(null), member(5))).toBeLessThan(0);
  });
});
