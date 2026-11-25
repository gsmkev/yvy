/** Columnas de la tabla de Costos. */
import { fmtIsoDate } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { fmtGs, fmtMoney } from "../../../lib/money";
import type { Column } from "../../ui";
import { PhotoRowMenu } from "../InvoicePhoto";
import { dayOf, type CostEntry } from "./useCosts";

/** Texto con el que se nombra un movimiento: su descripción o, si no tiene, su categoría. */
export const costLabel = (c: CostEntry) => c.description ?? tk(`ui.cost.category_${c.category}`);

function amountCell(c: CostEntry) {
  const sale = c.category === "sale";
  return (
    <span className={sale ? "text-accion" : ""}>
      {sale ? "" : "-"}
      {fmtMoney(c.amount, c.currency)}
      {c.currency !== "PYG" && <span className="block text-meta text-tinta-2">{fmtGs(c.amountPyg)}</span>}
    </span>
  );
}

/** Columnas de Costos; la descripción es el título de la tarjeta en el celular. */
export function costColumns(farmName: (id: string | null) => string, onEdit: (c: CostEntry) => void, onRemove: (c: CostEntry) => void): Column<CostEntry>[] {
  return [
    { id: "date", header: t("ui.cost.date"), cell: (c) => <span className="whitespace-nowrap">{fmtIsoDate(dayOf(c.occurredAt))}</span> },
    { id: "category", header: t("ui.cost.category"), hideBelow: "md", cell: (c) => tk(`ui.cost.category_${c.category}`) },
    { id: "activity", header: t("ui.cost.activity"), hideBelow: "lg", cell: (c) => tk(`ui.activity.${c.activity}`) },
    {
      id: "description",
      header: t("ui.cost.description"),
      mobile: "title",
      cell: (c) => (
        <>
          {c.description ?? <span className="md:hidden">{tk(`ui.cost.category_${c.category}`)}</span>}
          <span className="block text-meta text-tinta-2">{[farmName(c.farmId), c.origin !== "manual" ? t("ui.cost.fromRecord") : ""].filter(Boolean).join(", ")}</span>
        </>
      ),
    },
    { id: "amount", header: t("ui.cost.amount"), align: "right", cell: amountCell },
    {
      id: "_actions",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (c) => (
        <PhotoRowMenu
          kind="cost-entries"
          id={c.id}
          hasPhoto={!!c.photoPath}
          name={costLabel(c)}
          onEdit={c.origin === "manual" ? () => onEdit(c) : undefined}
          onDelete={c.origin === "manual" ? () => onRemove(c) : undefined}
        />
      ),
    },
  ];
}
