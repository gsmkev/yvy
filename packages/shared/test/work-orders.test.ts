import { describe, expect, it } from "vitest";
import type { WorkOrder } from "@yvy/shared";
import { groupOrders, plotsLabel, productsLabel, type OrderRow } from "../src/work-orders";

const order: WorkOrder = {
  labor: "spraying",
  products: [{ productId: "0190b2c4-7a1e-7c3a-9b2d-3f4e5a6b7c8d", name: "Glifosato", dose: 2, unit: "l_ha" }],
  machine: "Pulverizadora Jacto",
  contractorId: "0190b2c4-7a1e-7c3a-9b2d-3f4e5a6b7c8e",
  note: "Viento menor a 12 km/h",
};
const row = (over: Partial<OrderRow>): OrderRow => ({
  id: Math.random().toString(),
  title: "Pulverización",
  farmId: "f1",
  plotName: "Lote 1",
  assigneeId: "u1",
  assigneeName: "Ramón",
  contractorName: "Villalba SA",
  dueDate: "2026-11-20",
  status: "open",
  order,
  plannedAreaHa: 10,
  actualAreaHa: null,
  createdAt: 1000,
  ...over,
});

describe("órdenes de trabajo completas (E-20)", () => {
  it("junta las tareas de una misma orden y suma superficie y avance", () => {
    const gs = groupOrders([
      row({ plotName: "A", plannedAreaHa: 10, status: "done", actualAreaHa: 9.5 }),
      row({ plotName: "B", plannedAreaHa: 20 }),
      row({ plotName: "C", createdAt: 2000, order: { ...order, labor: "harvest", products: [] } }),
    ]);
    expect(gs).toHaveLength(2);
    // la más reciente primero
    expect(gs[0]!.labor).toBe("harvest");
    const spray = gs[1]!;
    expect(spray.plotNames).toEqual(["A", "B"]);
    expect(spray.plannedHa).toBe(30);
    expect(spray.actualHa).toBe(9.5);
    expect([spray.done, spray.status]).toEqual([1, "open"]);
    expect(spray.machine).toBe("Pulverizadora Jacto");
  });

  it("no junta órdenes con distinto operario, fecha o contenido aunque se hayan creado juntas", () => {
    expect(groupOrders([row({}), row({ assigneeId: "u2" })])).toHaveLength(2);
    expect(groupOrders([row({}), row({ dueDate: "2026-11-21" })])).toHaveLength(2);
    expect(groupOrders([row({}), row({ order: { ...order, note: "otra" } })])).toHaveLength(2);
  });

  it("está cerrada cuando todos sus lotes se hicieron o se cancelaron; el costo suma los lotes", () => {
    const [g] = groupOrders([
      row({ status: "done", costPyg: 100 }),
      row({ status: "cancelled", costPyg: 0 }),
    ]);
    expect(g!.status).toBe("done");
    expect(g!.costPyg).toBe(100);
    expect(groupOrders([row({ status: "cancelled" })])[0]!.status).toBe("cancelled");
  });

  it("resume lotes e insumos para la tabla", () => {
    expect(plotsLabel(["A", "B"])).toBe("A, B");
    expect(plotsLabel(["A", "B", "C", "D", "E"])).toBe("A, B, C y 2 más");
    expect(productsLabel(order)).toBe("Glifosato 2 L/ha");
  });
});

const appRow = (over: Partial<OrderRow>): OrderRow => ({
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

describe("órdenes de trabajo (app)", () => {
  it("junta las tareas de una misma orden y calcula el estado", () => {
    const g = groupOrders([appRow({ id: "1" }), appRow({ id: "2", plotName: "Lote 2", status: "done", actualAreaHa: 8 }), appRow({ id: "3", createdAt: 2000 })]);
    expect(g).toHaveLength(2);
    expect(g[0]!.rows).toHaveLength(1); // la más reciente primero
    expect(g[1]!.rows).toHaveLength(2);
    expect(g[1]!.status).toBe("open");
    expect(g[1]!.done).toBe(1);
    expect(g[1]!.plannedHa).toBe(20);
    expect(g[1]!.actualHa).toBe(8);
  });
  it("cerrada cuando todas las tareas están hechas", () => {
    expect(groupOrders([appRow({ status: "done" })])[0]!.status).toBe("done");
  });
  it("resume los lotes", () => {
    expect(plotsLabel(["A", "B"])).toBe("A, B");
    expect(plotsLabel(["A", "B", "C", "D", "E"])).toBe("A, B, C y 2 más");
  });
});
