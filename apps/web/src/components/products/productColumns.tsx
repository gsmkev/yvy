/** Columnas de la tabla del catálogo de productos. */
import { t, tk } from "../../lib/i18n";
import type { DoseRange } from "../../lib/products";
import type { Product } from "../../lib/types";
import type { Column } from "../ui";
import { RowMenu } from "../erp/adminSlot";

/** "Dosis habitual: 1 a 3 l/ha", o null si el producto no tiene rango. */
export function doseShown(p: Product, ranges: DoseRange[] | undefined): string | null {
  const r = ranges?.find((x) => x.productId === p.id);
  if (!r || (r.min === null && r.max === null)) return null;
  const n = (v: number) => v.toLocaleString("es-PY", { maximumFractionDigits: 2 });
  const range = r.min !== null && r.max !== null ? `${n(r.min)} a ${n(r.max)}` : r.min !== null ? `${t("ui.review.atLeast")} ${n(r.min)}` : `${t("ui.review.upTo")} ${n(r.max!)}`;
  return t("ui.product.doseShown", { range, unit: p.unit === "l" ? "l/ha" : "kg/ha" });
}

/** Qué columnas mostrar y qué hacer con cada fila. */
export interface ProductColumnsOptions {
  /** Ficha de la estancia: el panel es angosto y el tipo, la unidad y el principio activo van bajo el nombre. */
  compact: boolean;
  products: Product[];
  ranges: DoseRange[] | undefined;
  canEdit: boolean;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
}

function nameColumn(compact: boolean): Column<Product> {
  return {
    id: "name",
    header: t("ui.product.name"),
    mobile: "title",
    sort: (a, b) => a.name.localeCompare(b.name),
    cell: (p) => (
      <>
        {p.name}
        <span className={`block text-xs font-normal text-tinta-2 ${compact ? "" : "sm:hidden"}`}>
          {[tk(`fields.product.type_${p.type}`), tk(`fields.product.unit_${p.unit}`), compact ? p.activeIngredient : null].filter(Boolean).join(", ")}
        </span>
      </>
    ),
  };
}

function detailColumns(compact: boolean, products: Product[]): Column<Product>[] {
  if (compact) return [];
  const cols: Column<Product>[] = [
    { id: "type", header: t("ui.product.type"), hideBelow: "sm", cell: (p) => tk(`fields.product.type_${p.type}`) },
    { id: "unit", header: t("ui.product.unit"), hideBelow: "sm", cell: (p) => tk(`fields.product.unit_${p.unit}`) },
  ];
  if (products.some((p) => p.activeIngredient)) {
    cols.push({ id: "ai", header: t("ui.product.activeIngredient"), hideBelow: "md", cell: (p) => <span className="text-tinta-2">{p.activeIngredient ?? ""}</span> });
  }
  return cols;
}

function extraColumns({ compact, products, ranges }: ProductColumnsOptions): Column<Product>[] {
  const cols: Column<Product>[] = [];
  if (products.some((p) => p.withdrawalDays !== null)) {
    cols.push({ id: "wd", header: t("ui.product.withdrawal"), align: "right", hideBelow: compact ? undefined : "lg", cell: (p) => p.withdrawalDays ?? "" });
  }
  if ((ranges ?? []).some((r) => r.min !== null || r.max !== null)) {
    cols.push({ id: "dose", header: t("ui.product.doseCol"), hideBelow: "lg", cell: (p) => <span className="text-tinta-2">{doseShown(p, ranges) ?? ""}</span> });
  }
  return cols;
}

/** Columnas del catálogo: nombre, tipo, unidad, principio activo, carencia, dosis habitual y menú de la fila. */
export function productColumns(o: ProductColumnsOptions): Column<Product>[] {
  const menu: Column<Product> = {
    id: "menu",
    header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
    align: "right",
    width: "3rem",
    cell: (p) => <RowMenu name={p.name} onEdit={() => o.onEdit(p)} onDelete={() => o.onDelete(p)} />,
  };
  return [nameColumn(o.compact), ...detailColumns(o.compact, o.products), ...extraColumns(o), ...(o.canEdit ? [menu] : [])];
}
