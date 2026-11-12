/** Órdenes de trabajo (E-20): una orden con varios lotes se guarda como una tarea por lote; acá se vuelve a juntar. */
import { doseText, type WorkOrder } from "@yvy/shared";
import { fmtIsoDate } from "./format";
import { t, tk } from "./i18n";

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
  return `${names.slice(0, max).join(", ")} ${t("ui.orderPlotsMore", { n: names.length - max })}`;
}

/** Insumos de la orden como texto: "Glifosato 2 l/ha + Aceite 0,5 l/ha". Vacío si no hay. */
export const productsLabel = (o: WorkOrder): string => o.products.map(doseText).join(" + ");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtHa = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PY", { maximumFractionDigits: 1 })} ha`);

/**
 * Hoja imprimible de la orden para entregarla al operario o al contratista: labor, estancia, lotes con su
 * superficie, insumos con dosis y cantidad total, máquina, quién la hace, fecha, notas y lugar para firmar.
 * HTML autónomo, sin depender de los estilos de la app.
 */
export function orderSheetHtml(g: OrderGroup, farmName: string): string {
  const labor = tk(`ui.orderLabor_${g.labor}`);
  const plots = g.rows
    .map((r) => `<tr><td>${esc(r.plotName ?? "—")}</td><td class="n">${esc(fmtHa(r.plannedAreaHa))}</td></tr>`)
    .join("");
  const products = g.order.products
    .map((p) => {
      // Cantidad total prevista: dosis por la superficie total (solo si la dosis es por hectárea).
      const perHa = /_ha$/.test(String(p.unit));
      const total = perHa && g.plannedHa !== null ? p.dose * g.plannedHa : null;
      const base = String(p.unit).replace(/_ha$/, "");
      return `<tr><td>${esc(p.name)}</td><td class="n">${esc(doseText({ ...p, name: "" }))}</td><td class="n">${
        total === null ? "—" : `${total.toLocaleString("es-PY", { maximumFractionDigits: 1 })} ${esc(base)}`
      }</td></tr>`;
    })
    .join("");
  const who = [
    g.contractorName ? `${t("ui.orderContractor")}: ${g.contractorName}` : null,
    `${t("ui.orderAssignee")}: ${g.assigneeName ?? "—"}`,
  ]
    .filter(Boolean)
    .map((l) => `<p>${esc(l!)}</p>`)
    .join("");
  return `<!doctype html><html lang="es-PY"><head><meta charset="utf-8"><title>${esc(labor)} · ${esc(farmName)}</title>
<style>
body{font-family:system-ui,sans-serif;color:#1E2419;margin:24px;max-width:720px}
h1{font-family:Georgia,serif;font-size:22px;margin:0}
h2{font-size:13px;margin:20px 0 6px;border-bottom:1px solid #8C9186;padding-bottom:4px}
p{margin:2px 0;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:14px}
td,th{padding:5px 8px 5px 0;border-bottom:1px solid #DAD6C8;text-align:left;vertical-align:top}
.n{text-align:right;white-space:nowrap}
.sign{display:flex;gap:32px;margin-top:48px}
.sign div{flex:1;border-top:1px solid #1E2419;padding-top:4px;font-size:13px}
@media print{@page{margin:14mm}}
</style></head><body>
<h1>${esc(labor)}</h1>
<p>${esc(farmName)} · ${esc(t("ui.orderDue"))}: ${esc(fmtIsoDate(g.dueDate))}</p>
<h2>${esc(t("ui.orderPlots"))}</h2>
<table><thead><tr><th>${esc(t("ui.orderPlot"))}</th><th class="n">${esc(t("ui.orderPlanned"))}</th></tr></thead><tbody>${plots}</tbody>${
    g.rows.length > 1
      ? `<tfoot><tr><th>${esc(t("ui.orderTotal"))}</th><th class="n">${esc(fmtHa(g.plannedHa))}</th></tr></tfoot>`
      : ""
  }</table>
${
  products
    ? `<h2>${esc(t("ui.orderProducts"))}</h2><table><thead><tr><th>${esc(t("ui.orderProduct"))}</th><th class="n">${esc(t("ui.orderDose"))}</th><th class="n">${esc(t("ui.orderTotalQty"))}</th></tr></thead><tbody>${products}</tbody></table>`
    : ""
}
<h2>${esc(t("ui.orderWho"))}</h2>
${who}
${g.machine ? `<p>${esc(t("ui.orderMachine"))}: ${esc(g.machine)}</p>` : ""}
${g.order.volumeLHa ? `<p>${esc(t("ui.orderVolume"))}: ${g.order.volumeLHa} L/ha</p>` : ""}
${g.order.note ? `<h2>${esc(t("ui.orderNote"))}</h2><p>${esc(g.order.note)}</p>` : ""}
<div class="sign"><div>${esc(t("ui.orderSignDone"))}</div><div>${esc(t("ui.orderSignReceived"))}</div></div>
</body></html>`;
}
