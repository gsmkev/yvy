/** Stock mínimo por producto y depósito, con la lista de lo que hay que reponer (E-14). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, put } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { fmtQty } from "../../lib/money";
import { useProducts } from "../../lib/products";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, Form, FormFooter, Input, Modal, Select, Spinner, Tabs, toast } from "../ui";
import { useWarehouses } from "./WarehousesPanel";
import { HeaderActions, RowMenu, useGoSection, useTableExport } from "./adminSlot";

interface Minimum {
  id: string;
  productId: string;
  warehouseId: string;
  minQty: number;
}
interface Low {
  productId: string;
  warehouseId: string;
  qty: number;
  minQty: number;
  missing: number;
}

function lowColumns({ prod, wh, unit }: { prod: (id: string) => { name: string } | undefined; wh: (id: string) => string; unit: (id: string) => string }): Column<Low>[] {
  return [
    { id: "product", header: t("ui.stockProduct"), cell: (l) => prod(l.productId)?.name },
    { id: "where", header: t("ui.stockWhere"), hideBelow: "sm", cell: (l) => <span className="text-tinta-2">{wh(l.warehouseId)}</span> },
    { id: "qty", header: t("ui.stockQty"), align: "right", hideBelow: "sm", cell: (l) => fmtQty(l.qty, unit(l.productId)) },
    { id: "min", header: t("ui.minStockMin"), align: "right", hideBelow: "md", cell: (l) => fmtQty(l.minQty, unit(l.productId)) },
    { id: "missing", header: t("ui.minStockMissingHead"), align: "right", cell: (l) => <span className="text-trigo-texto">{fmtQty(l.missing, unit(l.productId))}</span>, sort: (a, b) => a.missing - b.missing },
  ];
}

function minColumns({ prod, wh, unit }: { prod: (id: string) => { name: string } | undefined; wh: (id: string) => string; unit: (id: string) => string }, onEdit: (m: Minimum) => void, onRemove: (m: Minimum) => void): Column<Minimum>[] {
  return [
    { id: "product", header: t("ui.stockProduct"), cell: (m) => prod(m.productId)?.name },
    { id: "where", header: t("ui.stockWhere"), cell: (m) => wh(m.warehouseId) },
    { id: "min", header: t("ui.minStockMin"), align: "right", cell: (m) => fmtQty(m.minQty, unit(m.productId)) },
    {
      id: "menu",
      header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (m) => <RowMenu name={prod(m.productId)?.name ?? ""} onEdit={() => onEdit(m)} onDelete={() => onRemove(m)} />,
    },
  ];
}

export function MinStockPanel() {
  const products = useProducts();
  const warehouses = useWarehouses();
  const mins = useQuery({ queryKey: ["erp", "stock-minimums"], queryFn: () => get<Minimum[]>("/org/erp/stock/minimums") });
  const low = useQuery({ queryKey: ["erp", "stock-low"], queryFn: () => get<Low[]>("/org/erp/stock/low") });
  const [editing, setEditing] = useState<Minimum | "new" | null>(null);
  const [removing, setRemoving] = useState<Minimum | null>(null);
  const [tab, setTab] = useState<"low" | "all">("low");
  const exp = useTableExport(tab === "low" ? "stock-bajo" : "stock-minimo");
  const goSection = useGoSection();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (m: Minimum) => del(`/org/erp/stock/minimums/${m.id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (mins.isLoading || products.isLoading || warehouses.isLoading) return <Spinner />;
  if (mins.error) return <ErrorBox error={mins.error} />;
  const prod = (id: string) => products.data?.find((p) => p.id === id);
  const wh = (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "";
  const unit = (id: string) => tk(`fields.productUnit_${prod(id)?.unit ?? "l"}`);
  const minRows = mins.data ?? [];
  const lowRows = low.data ?? [];
  const needProduct = (products.data ?? []).length === 0;
  const needWarehouse = (warehouses.data ?? []).length === 0;
  if (needProduct || needWarehouse)
    return (
      <EmptyState
        title={t(needProduct ? "ui.stockNeedProductTitle" : "ui.stockNeedWarehouseTitle")}
        action={
          <Button variant="primary" onClick={() => goSection(needProduct ? "products" : "warehouses")}>
            {t(needProduct ? "ui.productLoad" : "ui.warehouseLoad")}
          </Button>
        }
      >
        {t(needProduct ? "ui.stockNeedProductBody" : "ui.stockNeedWarehouseBody")}
      </EmptyState>
    );
  const newButton = (
    <Button variant="primary" onClick={() => setEditing("new")}>
      {t("ui.minStockNew")}
    </Button>
  );
  const lowCols = lowColumns({ prod, wh, unit });
  const minCols = minColumns({ prod, wh, unit }, setEditing, setRemoving);
  const noMins = minRows.length === 0;
  return (
    <div className="flex flex-col gap-4">
      {!noMins && <HeaderActions>{newButton}</HeaderActions>}
      {noMins ? (
        <EmptyState title={t("ui.emptyMinTitle")} action={newButton}>
          {t("ui.emptyMinBody")}
        </EmptyState>
      ) : (
        <>
          {(tab === "low" ? lowRows.length : minRows.length) > 0 && exp.menu}
          <Tabs
            tabs={[
              { id: "low", label: t("ui.minTabLow"), count: lowRows.length },
              { id: "all", label: t("ui.minTabAll"), count: minRows.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div ref={exp.ref}>
            {tab === "low" ? (
              <DataTable columns={lowCols} rows={lowRows} rowKey={(l) => `${l.productId}-${l.warehouseId}`} caption={t("ui.minTabLow")} empty={<EmptyState compact title={t("ui.emptyLowTitle")}>{t("ui.emptyLowBody")}</EmptyState>} />
            ) : (
              <DataTable columns={minCols} rows={minRows} rowKey={(m) => m.id} caption={t("ui.minTabAll")} />
            )}
          </div>
        </>
      )}
      {editing && <MinModal row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title={prod(removing.productId)?.name ?? ""}
          message={t("ui.erpDeleteConfirm", { name: prod(removing.productId)?.name ?? "" })}
          confirmLabel={t("ui.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function MinModal({ row, onClose }: { row: Minimum | null; onClose: () => void }) {
  const products = useProducts();
  const warehouses = useWarehouses();
  const qc = useQueryClient();
  const [productId, setProductId] = useState(row?.productId ?? products.data?.[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(row?.warehouseId ?? warehouses.data?.[0]?.id ?? "");
  const [minQty, setMinQty] = useState(row ? String(row.minQty) : "");
  const save = useMutation({
    mutationFn: () => put("/org/erp/stock/minimums", { productId, warehouseId, minQty: Number(minQty) }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.minStockNew")} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
        <div className="col-span-2">
          <Field label={t("ui.stockProduct")}>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        </div>
        <Field label={t("ui.stockWhere")}>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} />
        </Field>
        <Field label={t("ui.minStockMin")}>
          <Input required type="number" min={0} step="any" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
