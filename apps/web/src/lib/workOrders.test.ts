import { describe, expect, it } from "vitest";
import type { WorkOrder } from "@yvy/shared";
import { groupOrders, orderSheetHtml, plotsLabel, productsLabel, type OrderRow } from "./workOrders";

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

  it("la hoja imprimible trae labor, lotes con superficie, insumos con cantidad total, máquina, ejecutor y notas", () => {
    const [g] = groupOrders([row({ plotName: "Lote Norte", plannedAreaHa: 10 }), row({ plotName: "Lote Sur", plannedAreaHa: 30 })]);
    const html = orderSheetHtml(g!, "Estancia La Esperanza");
    expect(html).toContain("Pulverización");
    expect(html).toContain("Estancia La Esperanza");
    expect(html).toContain("Lote Norte");
    expect(html).toContain("Lote Sur");
    expect(html).toContain("Glifosato");
    // 2 L/ha por 40 ha
    expect(html).toContain("80 l");
    expect(html).toContain("Pulverizadora Jacto");
    expect(html).toContain("Villalba SA");
    expect(html).toContain("Ramón");
    expect(html).toContain("Viento menor a 12 km/h");
  });

  it("escapa los textos de la hoja", () => {
    const [g] = groupOrders([row({ plotName: "<script>x</script>", order: { ...order, note: "<img src=x onerror=1>" } })]);
    const html = orderSheetHtml(g!, "Finca <b>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>");
  });
});
