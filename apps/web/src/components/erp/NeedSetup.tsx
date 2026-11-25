/** Vacío de las pantallas de inventario cuando todavía no hay productos o depósitos: lleva a cargarlos. */
import { t } from "../../lib/i18n";
import { Button, EmptyState } from "../ui";
import { useGoSection } from "./adminSlot";

/** Explica qué falta y ofrece el botón que lleva a la sección donde cargarlo. */
export function NeedSetup({ needed }: { needed: "product" | "warehouse" }) {
  const goSection = useGoSection();
  const product = needed === "product";
  return (
    <EmptyState
      title={t(product ? "ui.stock.needProductTitle" : "ui.stock.needWarehouseTitle")}
      action={
        <Button variant="primary" onClick={() => goSection(product ? "products" : "warehouses")}>
          {t(product ? "ui.product.load" : "ui.warehouse.load")}
        </Button>
      }
    >
      {t(product ? "ui.stock.needProductBody" : "ui.stock.needWarehouseBody")}
    </EmptyState>
  );
}
