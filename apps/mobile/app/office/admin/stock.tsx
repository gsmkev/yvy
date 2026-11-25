/**
 * Stock: existencias por depósito y producto, movimientos recientes, vencimientos y ajuste por recuento
 * (dueño y administrador). El agrónomo ve cantidades: la API no le manda montos y esta pantalla tampoco los pide.
 * /org/erp/stock, /stock/moves, /stock/expiring y POST /stock/adjustments.
 */
import { useMemo, useState } from "react";
import { router, type Href } from "expo-router";
import { Plus } from "lucide-react-native";
import { t } from "@yvy/shared";
import { AdminGate, compactMoney, useAdminAccess, useProductMap, useWarehouses } from "../../../src/office/adminKit";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { stockRowsOf, type Lot, type Move, type Summary } from "../../../src/office/stock/model";
import { AdjustSheet, LotsList, MovesList, StockLinks, StockList, useAdjustEditor } from "../../../src/office/stock/StockParts";
import { FilterChips, Segmented, StatRow } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";
import { EmptyState } from "../../../src/ui/kit";

type Tab = "stock" | "moves" | "expiring";

/** Existencias de insumos por depósito y sus movimientos. */
export default function Stock() {
  const { manage } = useAdminAccess();
  const stock = useOnline<Summary>("/org/erp/stock");
  const moves = useOnline<Move[]>("/org/erp/stock/moves");
  const lots = useOnline<Lot[]>("/org/erp/stock/expiring");
  const wh = useWarehouses();
  const { products, byId } = useProductMap();
  const [tab, setTab] = useState<Tab>("stock");
  const [warehouseId, setWarehouseId] = useState("");
  const noSignal = useNoSignalReason();
  const warehouses = wh.data ?? [];
  const editor = useAdjustEditor(warehouseId || warehouses[0]?.id || "");
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "";

  const lotRows = lots.data ?? [];
  const showValue = (stock.data?.products ?? []).some((p) => p.valuePyg !== undefined);
  const rows = useMemo(
    () => stockRowsOf(stock.data, warehouseId).sort((a, b) => (byId.get(a.productId)?.name ?? "").localeCompare(byId.get(b.productId)?.name ?? "")),
    [stock.data, warehouseId, byId],
  );
  const moveRows = (moves.data ?? []).filter((m) => !warehouseId || m.warehouseId === warehouseId);
  const totalValue = rows.reduce((a, r) => a + (r.valuePyg ?? 0), 0);
  const needSetup = !wh.loading && warehouses.length === 0 && wh.data !== null;
  const names = { byId, whName };
  const total = compactMoney(totalValue, "PYG");

  return (
    <AdminGate need="stock" title={t("ui.admin.section_stock")}>
      <OfficeScreen
        title={t("ui.admin.section_stock")}
        query={stock}
        onRefresh={async () => {
          await Promise.all([stock.refresh(), moves.refresh(), lots.refresh(), wh.refresh()]);
        }}
        action={manage && !needSetup ? { label: t("ui.stock.mode_adjustment"), icon: Plus, onPress: editor.open, disabled: !!noSignal } : undefined}
      >
        {manage ? <NoSignalNote /> : null}
        {needSetup ? (
          <EmptyState title={t("ui.stock.needWarehouseTitle")} hint={t("ui.stock.needWarehouseBody")} action={manage ? t("ui.warehouse.load") : undefined} onAction={() => router.push("/office/admin/warehouses" as Href)} />
        ) : (
          <OnlineState query={stock} empty={{ title: t("ui.empty.stockTitle"), hint: t("ui.empty.stockBody") }} isEmpty={(d) => d.rows.length === 0 && d.products.length === 0}>
            {() => (
              <>
                <StatRow items={[{ label: t("office.adm.stockProducts"), value: rows.length }, ...(showValue ? [{ label: t("ui.stock.value"), value: total.value, unit: total.unit }] : [])]} />
                {warehouses.length > 1 ? <FilterChips value={warehouseId} onChange={setWarehouseId} options={[{ value: "", label: t("ui.cost.all") }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]} /> : null}
                <Segmented<Tab>
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "stock", label: t("ui.stock.tabStock") },
                    { value: "moves", label: t("ui.stock.moves") },
                    ...(lotRows.length > 0 ? [{ value: "expiring" as const, label: t("ui.expiring.title") }] : []),
                  ]}
                />
                {tab === "stock" && <StockList rows={rows} {...names} />}
                {tab === "moves" && <MovesList rows={moveRows} {...names} />}
                {tab === "expiring" && <LotsList rows={lotRows} byId={byId} />}
              </>
            )}
          </OnlineState>
        )}
        <StockLinks />
        <AdjustSheet editor={editor} products={products} warehouses={warehouses} byId={byId} />
      </OfficeScreen>
    </AdminGate>
  );
}
