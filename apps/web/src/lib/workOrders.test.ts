/** Pruebas de hoja imprimible de la orden. */
import { describe, expect, it } from "vitest";
import { groupOrders, type OrderRow, type WorkOrder } from "@yvy/shared";
import { orderSheetHtml } from "./workOrders";

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

describe("hoja imprimible de la orden", () => {
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
