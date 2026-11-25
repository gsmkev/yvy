/** Stock mínimo por producto y depósito, con la lista de lo que hay que reponer. */
import { useState } from "react";
import { t } from "../../lib/i18n";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, Spinner, Tabs } from "../ui";
import { HeaderActions, useTableExport } from "./adminSlot";
import { NeedSetup } from "./NeedSetup";
import { MinModal } from "./minstock/MinModal";
import { lowColumns, minColumns } from "./minstock/minColumns";
import { useMinStock, useRemoveMin, type Low, type MinNames, type Minimum } from "./minstock/useMinStock";

type Tab = "low" | "all";

/** Confirmación de baja de un mínimo. */
function RemoveMin({ row, name, onClose }: { row: Minimum; name: string; onClose: () => void }) {
  const remove = useRemoveMin(onClose);
  return (
    <ConfirmModal
      title={name}
      message={t("ui.erp.deleteConfirm", { name })}
      confirmLabel={t("ui.common.delete")}
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate(row)}
      onClose={onClose}
    />
  );
}

interface MinTablesProps {
  tab: Tab;
  names: MinNames;
  lowRows: Low[];
  minRows: Minimum[];
  onEdit: (m: Minimum) => void;
  onRemove: (m: Minimum) => void;
}

/** Tabla de la pestaña elegida: lo que falta reponer o todos los mínimos. */
function MinTables({ tab, names, lowRows, minRows, onEdit, onRemove }: MinTablesProps) {
  if (tab === "all") return <DataTable columns={minColumns(names, onEdit, onRemove)} rows={minRows} rowKey={(m) => m.id} caption={t("ui.min.tabAll")} />;
  const empty = <EmptyState compact title={t("ui.empty.lowTitle")}>{t("ui.empty.lowBody")}</EmptyState>;
  return <DataTable columns={lowColumns(names)} rows={lowRows} rowKey={(l) => `${l.productId}-${l.warehouseId}`} caption={t("ui.min.tabLow")} empty={empty} />;
}

/** Stock mínimo por producto y depósito y lista de lo que hay que reponer. */
export function MinStockPanel() {
  const [editing, setEditing] = useState<Minimum | "new" | null>(null);
  const [removing, setRemoving] = useState<Minimum | null>(null);
  const [tab, setTab] = useState<Tab>("low");
  const exp = useTableExport(tab === "low" ? "stock-bajo" : "stock-minimo");
  const { products, warehouses, mins, low, names, loading } = useMinStock();
  if (loading) return <Spinner />;
  if (mins.error) return <ErrorBox error={mins.error} />;
  if ((products.data ?? []).length === 0) return <NeedSetup needed="product" />;
  if ((warehouses.data ?? []).length === 0) return <NeedSetup needed="warehouse" />;
  const minRows = mins.data ?? [];
  const lowRows = low.data ?? [];
  const newButton = (
    <Button variant="primary" onClick={() => setEditing("new")}>
      {t("ui.min.stockNew")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {minRows.length > 0 && <HeaderActions>{newButton}</HeaderActions>}
      {minRows.length === 0 ? (
        <EmptyState title={t("ui.empty.minTitle")} action={newButton}>
          {t("ui.empty.minBody")}
        </EmptyState>
      ) : (
        <>
          {(tab === "low" ? lowRows.length : minRows.length) > 0 && exp.menu}
          <Tabs
            tabs={[
              { id: "low", label: t("ui.min.tabLow"), count: lowRows.length },
              { id: "all", label: t("ui.min.tabAll"), count: minRows.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div ref={exp.ref}>
            <MinTables tab={tab} names={names} lowRows={lowRows} minRows={minRows} onEdit={setEditing} onRemove={setRemoving} />
          </div>
        </>
      )}
      {editing && <MinModal row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && <RemoveMin row={removing} name={names.prod(removing.productId)?.name ?? ""} onClose={() => setRemoving(null)} />}
    </div>
  );
}
