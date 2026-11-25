/**
 * Stock mínimo y faltantes: lo que hay que reponer y el mínimo de cada producto y depósito.
 * Lo ven dueño, administrador y agrónomo; cargar o quitar mínimos, dueño y administrador.
 * /org/erp/stock/low, /stock/minimums (GET, PUT) y DELETE /stock/minimums/:id.
 */
import { Plus } from "lucide-react-native";
import { t } from "@yvy/shared";
import { AdminGate, useAdminAccess, useProductMap, useWarehouses } from "../../../src/office/adminKit";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { MinBody, MinSheet, type Low } from "../../../src/office/minStock/MinStockParts";
import { useMinEditor, type Minimum } from "../../../src/office/minStock/useMinEditor";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { useOnline } from "../../../src/office/useOnline";

/** Stock mínimo por producto y depósito. */
export default function MinStock() {
  const { manage } = useAdminAccess();
  const mins = useOnline<Minimum[]>("/org/erp/stock/minimums");
  const low = useOnline<Low[]>("/org/erp/stock/low");
  const wh = useWarehouses();
  const { products, byId } = useProductMap();
  const noSignal = useNoSignalReason();
  const warehouses = wh.data ?? [];
  const editor = useMinEditor(manage, warehouses[0]?.id ?? "");
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "";

  const loading = (mins.loading || low.loading || wh.loading) && mins.data === null;
  const needProduct = products.length === 0;
  const needWarehouse = wh.data !== null && warehouses.length === 0;
  const needSetup = needProduct || needWarehouse;
  return (
    <AdminGate need="stock" title={t("ui.admin.section_minstock")}>
      <OfficeScreen
        title={t("ui.admin.section_minstock")}
        query={mins}
        onRefresh={async () => {
          await Promise.all([mins.refresh(), low.refresh(), wh.refresh()]);
        }}
        action={manage && !needSetup ? { label: t("ui.min.stockNew"), icon: Plus, onPress: () => editor.open(null), disabled: !!noSignal } : undefined}
      >
        {manage ? <NoSignalNote /> : null}
        <MinBody mins={mins} lowRows={low.data ?? []} loading={loading} needProduct={needProduct} needWarehouse={needWarehouse} byId={byId} whName={whName} onOpen={manage ? editor.open : undefined} />
        <MinSheet editor={editor} products={products} warehouses={warehouses} />
      </OfficeScreen>
    </AdminGate>
  );
}
