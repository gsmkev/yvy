/** Hoja imprimible de una orden de trabajo. La agrupación de las tareas está en @yvy/shared. */
import { doseText, safeHtml, type OrderGroup } from "@yvy/shared";
import { fmtIsoDate } from "./format";
import { t, tk } from "./i18n";

const ONE_DECIMAL = { maximumFractionDigits: 1 };
const fmtHa = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-PY", ONE_DECIMAL) + " ha");

/**
 * Hoja imprimible de la orden para entregarla al operario o al contratista: labor, estancia, lotes con su
 * superficie, insumos con dosis y cantidad total, máquina, quién la hace, fecha, notas y lugar para firmar.
 * HTML autónomo, sin depender de los estilos de la app.
 */
export function orderSheetHtml(g: OrderGroup, farmName: string): string {
  const labor = tk(`ui.order.labor_${g.labor}`);
  const plots = g.rows.map(
    (r) => safeHtml`<tr><td>${r.plotName ?? "—"}</td><td class="n">${fmtHa(r.plannedAreaHa)}</td></tr>`,
  );
  const products = g.order.products.map((p) => {
    // Cantidad total prevista: dosis por la superficie total (solo si la dosis es por hectárea).
    const perHa = /_ha$/.test(String(p.unit));
    const total = perHa && g.plannedHa !== null ? p.dose * g.plannedHa : null;
    const base = String(p.unit).replace(/_ha$/, "");
    const qty = total === null ? "—" : total.toLocaleString("es-PY", ONE_DECIMAL) + " " + base;
    return safeHtml`<tr><td>${p.name}</td><td class="n">${doseText({ ...p, name: "" })}</td><td class="n">${qty}</td></tr>`;
  });
  const who = [
    g.contractorName ? `${t("ui.order.contractor")}: ${g.contractorName}` : null,
    `${t("ui.order.assignee")}: ${g.assigneeName ?? "—"}`,
  ]
    .filter(Boolean)
    .map((l) => safeHtml`<p>${l}</p>`);
  const footer =
    g.rows.length > 1
      ? safeHtml`<tfoot><tr><th>${t("ui.order.total")}</th><th class="n">${fmtHa(g.plannedHa)}</th></tr></tfoot>`
      : "";
  const productTable =
    products.length > 0
      ? safeHtml`<h2>${t("ui.order.products")}</h2><table><thead><tr><th>${t("ui.order.product")}</th><th class="n">${t("ui.order.dose")}</th><th class="n">${t("ui.order.totalQty")}</th></tr></thead><tbody>${products}</tbody></table>`
      : "";
  const machine = g.machine ? safeHtml`<p>${t("ui.order.machine")}: ${g.machine}</p>` : "";
  const volume = g.order.volumeLHa ? safeHtml`<p>${t("ui.order.volume")}: ${g.order.volumeLHa} L/ha</p>` : "";
  const note = g.order.note ? safeHtml`<h2>${t("ui.order.note")}</h2><p>${g.order.note}</p>` : "";
  return safeHtml`<!doctype html><html lang="es-PY"><head><meta charset="utf-8"><title>${labor}: ${farmName}</title>
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
<h1>${labor}</h1>
<p>${farmName}, ${t("ui.order.due")}: ${fmtIsoDate(g.dueDate)}</p>
<h2>${t("ui.order.plots")}</h2>
<table><thead><tr><th>${t("ui.order.plot")}</th><th class="n">${t("ui.order.planned")}</th></tr></thead><tbody>${plots}</tbody>${footer}</table>
${productTable}
<h2>${t("ui.order.who")}</h2>
${who}
${machine}
${volume}
${note}
<div class="sign"><div>${t("ui.order.signDone")}</div><div>${t("ui.order.signReceived")}</div></div>
</body></html>`.text;
}
