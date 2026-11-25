/** Órdenes de trabajo: una tarea por lote con insumos, máquina y operario o contratista. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { groupOrders, type OrderRow } from "@yvy/shared";
import { get } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import { Button, DataTable, EmptyState, ErrorBox, Spinner } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions } from "./adminSlot";
import { OrderModal } from "./orders/OrderModal";
import { orderColumns, printOrder } from "./orders/orderColumns";

/** Órdenes de trabajo agrupadas por tarea, con su hoja imprimible. */
export function OrdersPanel() {
  const [creating, setCreating] = useState(false);
  const farms = useFarms();
  const q = useQuery({ queryKey: ["erp", "orders"], queryFn: () => get<OrderRow[]>("/org/erp/work-orders") });
  const groups = useMemo(() => groupOrders(q.data ?? []), [q.data]);
  const farmName = (id: string) => farms.data?.find((f) => f.id === id)?.name ?? "";
  const columns = orderColumns(
    groups.some((g) => g.costPyg !== undefined),
    (g) => printOrder(g, farmName(g.farmId)),
  );
  const newBtn = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      {t("ui.order.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {groups.length > 0 && <HeaderActions>{newBtn}</HeaderActions>}
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && q.data.length === 0 && (
        <EmptyState title={t("ui.order.emptyTitle")} action={newBtn}>
          {t("ui.order.emptyHint")}
        </EmptyState>
      )}
      {groups.length > 0 && (
        <ExportableTable name="ordenes-de-trabajo">
          <DataTable columns={columns} rows={groups} rowKey={(g) => g.key} caption={t("ui.admin.section_orders")} />
        </ExportableTable>
      )}
      {creating && <OrderModal onClose={() => setCreating(false)} />}
    </div>
  );
}
