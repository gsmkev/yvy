/** Inventario: stock por producto y depósito, costo promedio y movimientos de compra, consumo, transferencia y ajuste. */
import { useState } from "react";
import { t, tk } from "../../lib/i18n";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, FilterBar, Select, Spinner, Tabs } from "../ui";
import { ActionMenu } from "../menus";
import { HeaderActions, useTableExport } from "./adminSlot";
import { NeedSetup } from "./NeedSetup";
import { expiringColumns, moveColumns, stockColumns } from "./stock/columns";
import { MoveModal } from "./stock/MoveModal";
import type { Mode, StockMove } from "./stock/types";
import { useRemoveMove, useStockData } from "./stock/useStockData";

type Tab = "stock" | "moves" | "expiring";

const EXPORT_NAME: Record<Tab, string> = { stock: "stock", moves: "movimientos-de-stock", expiring: "stock-por-vencer" };

/** Alta de compra y menú con consumo, transferencia y ajuste. */
function StockActions({ onMode }: { onMode: (m: Mode) => void }) {
  return (
    <HeaderActions>
      <Button variant="primary" onClick={() => onMode("purchase")}>
        {t("ui.stock.mode_purchase")}
      </Button>
      <ActionMenu
        label={t("ui.common.moreActions")}
        items={(["consumption", "transfer", "adjustment"] as const).map((m) => ({ label: t(`ui.stock.mode_${m}`), onSelect: () => onMode(m) }))}
      />
    </HeaderActions>
  );
}

/** Confirmación de baja de un movimiento de stock. */
function RemoveMove({ move, onClose }: { move: StockMove; onClose: () => void }) {
  const remove = useRemoveMove(onClose);
  return (
    <ConfirmModal
      title={tk(`ui.stock.origin_${move.origin}`)}
      message={t("ui.stock.deleteConfirm")}
      confirmLabel={t("ui.common.delete")}
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate(move)}
      onClose={onClose}
    />
  );
}

interface StockTablesProps {
  tab: Tab;
  data: ReturnType<typeof useStockData>;
  onBuy: () => void;
  onRemove: (m: StockMove) => void;
}

/** Tabla de la pestaña elegida: existencias, movimientos o lotes por vencer. */
function StockTables({ tab, data, onBuy, onRemove }: StockTablesProps) {
  const { stock, moves, expiring, lookup } = data;
  if (tab === "expiring") {
    return <DataTable columns={expiringColumns(lookup)} rows={expiring.data ?? []} rowKey={(l) => `${l.productId}-${l.lot}-${l.expiresOn}`} caption={t("ui.expiring.title")} />;
  }
  if (tab === "moves") {
    if (moves.isLoading) return <Spinner />;
    const empty = <EmptyState compact title={t("ui.erp.empty")}>{t("ui.empty.movesBody")}</EmptyState>;
    return <DataTable columns={moveColumns(lookup, moves.data ?? [], onRemove)} rows={moves.data ?? []} rowKey={(m) => m.id} caption={t("ui.stock.moves")} empty={empty} />;
  }
  const list = stock.data?.products ?? [];
  const empty = (
    <EmptyState title={t("ui.empty.stockTitle")} action={<Button variant="primary" onClick={onBuy}>{t("ui.stock.mode_purchase")}</Button>}>
      {t("ui.empty.stockBody")}
    </EmptyState>
  );
  return <DataTable columns={stockColumns(lookup, stock.data?.rows ?? [], list)} rows={list} rowKey={(p) => p.productId} caption={t("ui.stock.tabStock")} empty={empty} />;
}

/** Inventario por producto y depósito con sus movimientos. */
export function StockPanel() {
  const [productId, setProductId] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [tab, setTab] = useState<Tab>("stock");
  const [removing, setRemoving] = useState<StockMove | null>(null);
  const exp = useTableExport(EXPORT_NAME[tab]);
  const data = useStockData(productId);
  const { stock, products, warehouses, moves, expiring, loading } = data;
  if (loading) return <Spinner />;
  if (stock.error) return <ErrorBox error={stock.error} />;
  if ((products.data ?? []).length === 0) return <NeedSetup needed="product" />;
  if ((warehouses.data ?? []).length === 0) return <NeedSetup needed="warehouse" />;
  const list = stock.data?.products ?? [];
  const lots = expiring.data ?? [];
  const moveRows = moves.data ?? [];
  const shown = { stock: list.length, moves: moveRows.length, expiring: lots.length }[tab];
  return (
    <div className="flex flex-col gap-4">
      <StockActions onMode={setMode} />
      {shown > 0 && exp.menu}
      <Tabs
        tabs={[
          { id: "stock", label: t("ui.stock.tabStock") },
          { id: "moves", label: t("ui.stock.moves") },
          ...(lots.length > 0 ? [{ id: "expiring" as const, label: t("ui.expiring.title"), count: lots.length }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "moves" && (
        <FilterBar sheet={false}>
          <Field label={t("ui.stock.product")}>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} options={[{ value: "", label: t("ui.cost.all") }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
          </Field>
        </FilterBar>
      )}
      <div ref={exp.ref}>
        <StockTables tab={tab} data={data} onBuy={() => setMode("purchase")} onRemove={setRemoving} />
      </div>
      {mode && <MoveModal mode={mode} onClose={() => setMode(null)} />}
      {removing && <RemoveMove move={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}
