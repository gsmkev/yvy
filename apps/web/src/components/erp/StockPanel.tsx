/** Inventario: stock por producto y depósito, costo promedio y movimientos de compra, consumo, transferencia y ajuste. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, withQs } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { useProducts } from "../../lib/products";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, FilterBar, Select, Spinner, Tabs, toast } from "../ui";
import { HeaderActions, useGoSection, useTableExport } from "./adminSlot";
import { ActionMenu } from "../menus";
import { useWarehouses } from "./WarehousesPanel";
import { expiringColumns, moveColumns, stockColumns } from "./stock/columns";
import { MoveModal } from "./stock/MoveModal";
import type { ExpiringLot, Mode, StockMove, Summary } from "./stock/types";

const useStock = () => useQuery({ queryKey: ["erp", "stock"], queryFn: () => get<Summary>("/org/erp/stock") });



function NeedSetup({ needProduct, onGo }: { needProduct: boolean; onGo: (section: string) => void }) {
  return (
    <EmptyState
      title={t(needProduct ? "ui.stock.needProductTitle" : "ui.stock.needWarehouseTitle")}
      action={
        <Button variant="primary" onClick={() => onGo(needProduct ? "products" : "warehouses")}>
          {t(needProduct ? "ui.product.load" : "ui.warehouse.load")}
        </Button>
      }
    >
      {t(needProduct ? "ui.stock.needProductBody" : "ui.stock.needWarehouseBody")}
    </EmptyState>
  );
}

/** Inventario por producto y depósito con sus movimientos. */
export function StockPanel() {
  const stock = useStock();
  const products = useProducts();
  const warehouses = useWarehouses();
  const [productId, setProductId] = useState("");
  const moves = useQuery({
    queryKey: ["erp", "stock-moves", productId],
    queryFn: () => get<StockMove[]>(withQs("/org/erp/stock/moves", { productId: productId || undefined })),
  });
  const expiring = useQuery({ queryKey: ["erp", "expiring"], queryFn: () => get<ExpiringLot[]>("/org/erp/stock/expiring") });
  const [mode, setMode] = useState<Mode | null>(null);
  const [tab, setTab] = useState<"stock" | "moves" | "expiring">("stock");
  const exp = useTableExport(tab === "stock" ? "stock" : tab === "moves" ? "movimientos-de-stock" : "stock-por-vencer");
  const goSection = useGoSection();
  const [removing, setRemoving] = useState<StockMove | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (m: StockMove) => del(`/org/erp/stock/moves/${m.id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (stock.isLoading || products.isLoading || warehouses.isLoading) return <Spinner />;
  if (stock.error) return <ErrorBox error={stock.error} />;
  const needProduct = (products.data ?? []).length === 0;
  const needWarehouse = (warehouses.data ?? []).length === 0;
  if (needProduct || needWarehouse) return <NeedSetup needProduct={needProduct} onGo={goSection} />;
  const lk = {
    prod: (id: string) => products.data?.find((p) => p.id === id),
    wh: (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "",
    unit: (id: string) => tk(`fields.product.unit_${products.data?.find((p) => p.id === id)?.unit ?? "l"}`),
  };
  const list = stock.data?.products ?? [];
  const lots = expiring.data ?? [];
  const moveRows = moves.data ?? [];
  const stockCols = stockColumns(lk, stock.data?.rows ?? [], list);
  const moveCols = moveColumns(lk, moveRows, setRemoving);
  const expiringCols = expiringColumns(lk);
  const shown = tab === "stock" ? list.length : tab === "moves" ? moveRows.length : lots.length;
  return (
    <div className="flex flex-col gap-4">
      <HeaderActions>
        <Button variant="primary" onClick={() => setMode("purchase")}>
          {t("ui.stock.mode_purchase")}
        </Button>
        <ActionMenu
          label={t("ui.common.moreActions")}
          items={(["consumption", "transfer", "adjustment"] as const).map((m) => ({ label: t(`ui.stock.mode_${m}`), onSelect: () => setMode(m) }))}
        />
      </HeaderActions>
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
        <FilterBar>
          <Select
            aria-label={t("ui.stock.product")}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            options={[{ value: "", label: t("ui.cost.all") }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          />
        </FilterBar>
      )}
      <div ref={exp.ref}>
        {tab === "stock" && (
          <DataTable
            columns={stockCols}
            rows={list}
            rowKey={(p) => p.productId}
            caption={t("ui.stock.tabStock")}
            empty={
              <EmptyState title={t("ui.empty.stockTitle")} action={<Button variant="primary" onClick={() => setMode("purchase")}>{t("ui.stock.mode_purchase")}</Button>}>
                {t("ui.empty.stockBody")}
              </EmptyState>
            }
          />
        )}
        {tab === "moves" &&
          (moves.isLoading ? (
            <Spinner />
          ) : (
            <DataTable columns={moveCols} rows={moveRows} rowKey={(m) => m.id} caption={t("ui.stock.moves")} empty={<EmptyState compact title={t("ui.erp.empty")}>{t("ui.empty.movesBody")}</EmptyState>} />
          ))}
        {tab === "expiring" && <DataTable columns={expiringCols} rows={lots} rowKey={(l) => `${l.productId}-${l.lot}-${l.expiresOn}`} caption={t("ui.expiring.title")} />}
      </div>
      {mode && <MoveModal mode={mode} onClose={() => setMode(null)} />}
      {removing && (
        <ConfirmModal
          title={tk(`ui.stock.origin_${removing.origin}`)}
          message={t("ui.stock.deleteConfirm")}
          confirmLabel={t("ui.common.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
