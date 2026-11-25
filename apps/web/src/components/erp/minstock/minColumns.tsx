/** Columnas de las tablas de stock mínimo y de faltantes. */
import { t } from "../../../lib/i18n";
import { fmtQty } from "../../../lib/money";
import type { Column } from "../../ui";
import { RowMenu } from "../adminSlot";
import type { Low, MinNames, Minimum } from "./useMinStock";

/** Columnas de lo que hay que reponer, ordenable por faltante. */
export function lowColumns({ prod, wh, unit }: MinNames): Column<Low>[] {
  return [
    { id: "product", header: t("ui.stock.product"), cell: (l) => prod(l.productId)?.name },
    { id: "where", header: t("ui.stock.where"), hideBelow: "sm", cell: (l) => <span className="text-tinta-2">{wh(l.warehouseId)}</span> },
    { id: "qty", header: t("ui.stock.qty"), align: "right", hideBelow: "sm", cell: (l) => fmtQty(l.qty, unit(l.productId)) },
    { id: "min", header: t("ui.min.stockMin"), align: "right", hideBelow: "md", cell: (l) => fmtQty(l.minQty, unit(l.productId)) },
    { id: "missing", header: t("ui.min.stockMissingHead"), align: "right", cell: (l) => <span className="text-trigo-texto">{fmtQty(l.missing, unit(l.productId))}</span>, sort: (a, b) => a.missing - b.missing },
  ];
}

/** Columnas de los mínimos cargados, con el menú de cada fila. */
export function minColumns({ prod, wh, unit }: MinNames, onEdit: (m: Minimum) => void, onRemove: (m: Minimum) => void): Column<Minimum>[] {
  return [
    { id: "product", header: t("ui.stock.product"), cell: (m) => prod(m.productId)?.name },
    { id: "where", header: t("ui.stock.where"), cell: (m) => wh(m.warehouseId) },
    { id: "min", header: t("ui.min.stockMin"), align: "right", cell: (m) => fmtQty(m.minQty, unit(m.productId)) },
    {
      id: "menu",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (m) => <RowMenu name={prod(m.productId)?.name ?? ""} onEdit={() => onEdit(m)} onDelete={() => onRemove(m)} />,
    },
  ];
}
