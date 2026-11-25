/** Columnas de la tabla de órdenes de trabajo y su hoja imprimible. */
import { plotsLabel, productsLabel, type OrderGroup } from "@yvy/shared";
import { fmtIsoDate } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { orderSheetHtml } from "../../../lib/workOrders";
import { Button, type Column } from "../../ui";

const ha = (n: number | null) => (n !== null ? n.toLocaleString("es-PY", { maximumFractionDigits: 1 }) + " ha" : "");

/** Abre la hoja de la orden en una ventana y manda a imprimirla. */
export function printOrder(g: OrderGroup, farmName: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(orderSheetHtml(g, farmName));
  w.document.close();
  w.focus();
  w.print();
}

function statusText(g: OrderGroup) {
  return g.status === "open" && g.done > 0 ? t("ui.order.progress", { done: g.done, total: g.rows.length }) : tk(`ui.order.status_${g.status}`);
}

function executorCell(g: OrderGroup) {
  if (!g.contractorName) return g.assigneeName;
  return (
    <>
      {g.contractorName}
      <span className="block text-meta text-tinta-2">{g.assigneeName}</span>
    </>
  );
}

/** Columnas de las órdenes agrupadas por tarea; `hasCost` suma el costo y `onPrint` imprime la hoja de una orden. */
export function orderColumns(hasCost: boolean, onPrint: (g: OrderGroup) => void): Column<OrderGroup>[] {
  const cols: Column<OrderGroup>[] = [
    {
      id: "labor",
      header: t("ui.order.labor"),
      cell: (g) => (
        <>
          {tk(`ui.order.labor_${g.labor}`)}
          <span className="block text-meta font-normal text-tinta-2 lg:hidden">{plotsLabel(g.plotNames)}</span>
        </>
      ),
    },
    { id: "plots", header: t("ui.order.plots"), hideBelow: "lg", cell: (g) => plotsLabel(g.plotNames) },
    { id: "executor", header: t("ui.order.executor"), hideBelow: "md", cell: executorCell },
    { id: "machine", header: t("ui.order.machine"), hideBelow: "lg", cell: (g) => g.machine ?? "" },
    { id: "products", header: t("ui.order.products"), hideBelow: "lg", cell: (g) => productsLabel(g.order) },
    { id: "due", header: t("ui.order.due"), cell: (g) => <span className="whitespace-nowrap">{fmtIsoDate(g.dueDate)}</span> },
    { id: "status", header: t("ui.order.status"), hideBelow: "sm", cell: statusText },
    { id: "planned", header: t("ui.order.planned"), align: "right", hideBelow: "md", cell: (g) => ha(g.plannedHa) },
    { id: "actual", header: t("ui.order.actual"), align: "right", hideBelow: "lg", cell: (g) => ha(g.actualHa) },
  ];
  if (hasCost) {
    cols.push({ id: "cost", header: t("ui.order.cost"), align: "right", hideBelow: "lg", cell: (g) => (g.done > 0 && g.costPyg !== undefined ? fmtGs(g.costPyg) : "") });
  }
  cols.push({
    id: "_print",
    header: <span className="sr-only">{t("ui.order.print")}</span>,
    align: "right",
    cell: (g) => (
      <Button variant="quiet" size="sm" onClick={() => onPrint(g)}>
        {t("ui.order.print")}
      </Button>
    ),
  });
  return cols;
}
