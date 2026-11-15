import { describe, expect, it } from "vitest";
import { groupOrders, plotsLabel, type OrderRow } from "../src/office/workOrders";

const row = (over: Partial<OrderRow>): OrderRow => ({
  id: "a",
  title: "Pulverización",
  farmId: "f",
  plotName: "Lote 1",
  assigneeId: "u",
  assigneeName: "Ana",
  contractorName: null,
  dueDate: "2026-11-20",
  status: "open",
  order: { labor: "spraying", products: [] },
  plannedAreaHa: 10,
  actualAreaHa: null,
  createdAt: 1000,
  ...over,
});

describe("órdenes de trabajo", () => {
  it("junta las tareas de una misma orden y calcula el estado", () => {
    const g = groupOrders([row({ id: "1" }), row({ id: "2", plotName: "Lote 2", status: "done", actualAreaHa: 8 }), row({ id: "3", createdAt: 2000 })]);
    expect(g).toHaveLength(2);
    expect(g[0]!.rows).toHaveLength(1); // la más reciente primero
    expect(g[1]!.rows).toHaveLength(2);
    expect(g[1]!.status).toBe("open");
    expect(g[1]!.done).toBe(1);
    expect(g[1]!.plannedHa).toBe(20);
    expect(g[1]!.actualHa).toBe(8);
  });
  it("cerrada cuando todas las tareas están hechas", () => {
    expect(groupOrders([row({ status: "done" })])[0]!.status).toBe("done");
  });
  it("resume los lotes", () => {
    expect(plotsLabel(["A", "B"])).toBe("A, B");
    expect(plotsLabel(["A", "B", "C", "D", "E"])).toBe("A, B, C y 2 más");
  });
});
