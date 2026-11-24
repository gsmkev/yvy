/** Órdenes de trabajo: una orden con varios lotes se guarda como una tarea por lote; acá se vuelve a juntar. */
import { doseText } from "./describe";
import { t } from "./i18n";
import type { WorkOrder } from "./records";

/** Orden de trabajo de un lote, tal como baja de la tarea que la guarda. */
export interface OrderRow {
  id: string;
  title: string;
  farmId: string;
  plotName: string | null;
  assigneeId: string;
  assigneeName: string | null;
  contractorName: string | null;
  dueDate: string;
  status: "open" | "done" | "cancelled";
  order: WorkOrder;
  plannedAreaHa: number | null;
  actualAreaHa: number | null;
  costPyg?: number;
  createdAt: number;
}

/** Orden de trabajo con todos sus lotes juntos. */
export interface OrderGroup {
  key: string;
  rows: OrderRow[];
  labor: WorkOrder["labor"];
  farmId: string;
  dueDate: string;
  assigneeName: string | null;
  contractorName: string | null;
  machine: string | null;
  order: WorkOrder;
  plotNames: string[];
  plannedHa: number | null;
  /** Suma de lo hecho; null si todavía no se cerró ningún lote. */
  actualHa: number | null;
  done: number;
  cancelled: number;
  status: "open" | "done" | "cancelled";
  costPyg?: number;
}

const sum = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

/**
 * Junta las tareas que salieron de una misma orden: mismo momento de alta, mismo operario y el mismo contenido.
 * Las órdenes quedan de la más reciente a la más vieja y los lotes en el orden en que vienen.
 */
export function groupOrders(rows: OrderRow[]): OrderGroup[] {
  const groups = new Map<string, OrderRow[]>();
  for (const r of rows) {
    const key = [r.createdAt, r.farmId, r.assigneeId, r.dueDate, JSON.stringify(r.order)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, rs]): OrderGroup => {
      const first = rs[0]!;
      const done = rs.filter((r) => r.status === "done").length;
      const cancelled = rs.filter((r) => r.status === "cancelled").length;
      return {
        key,
        rows: rs,
        labor: first.order.labor,
        farmId: first.farmId,
        dueDate: first.dueDate,
        assigneeName: first.assigneeName,
        contractorName: first.contractorName,
        machine: first.order.machine ?? null,
        order: first.order,
        plotNames: rs.map((r) => r.plotName ?? "—"),
        plannedHa: sum(rs.map((r) => r.plannedAreaHa)),
        actualHa: sum(rs.map((r) => r.actualAreaHa)),
        done,
        cancelled,
        status: cancelled === rs.length ? "cancelled" : done + cancelled === rs.length ? "done" : "open",
        ...(rs.some((r) => r.costPyg !== undefined) ? { costPyg: rs.reduce((a, r) => a + (r.costPyg ?? 0), 0) } : {}),
      };
    })
    .sort((a, b) => b.rows[0]!.createdAt - a.rows[0]!.createdAt || b.dueDate.localeCompare(a.dueDate));
}

/** "A, B y 2 más" para una celda de tabla. */
export function plotsLabel(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return names.slice(0, max).join(", ") + " " + t("ui.order.plotsMore", { n: names.length - max });
}

/** Insumos de la orden como texto: "Glifosato 2 l/ha + Aceite 0,5 l/ha". Vacío si no hay. */
export const productsLabel = (o: WorkOrder): string => o.products.map(doseText).join(" + ");
