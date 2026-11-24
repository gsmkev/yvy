/** Hoja imprimible de una orden de trabajo (E-20). La agrupación de las tareas está en @yvy/shared. */
import { doseText, type OrderGroup } from "@yvy/shared";
import { fmtIsoDate } from "./format";
import { t, tk } from "./i18n";

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
