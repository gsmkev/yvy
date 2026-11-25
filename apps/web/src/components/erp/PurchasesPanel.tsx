/** Compras: orden, factura del proveedor y recepción en depósito. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PurchaseStatus } from "@yvy/shared";
import { get } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtMoney } from "../../lib/money";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, FilterBar, Select, Spinner } from "../ui";
import { useParties } from "./PartiesPanel";
import { HeaderActions, useTableExport } from "./adminSlot";
import { NewPurchase } from "./purchases/NewPurchase";
import { PurchaseDetail } from "./purchases/PurchaseDetail";
import type { Purchase } from "./purchases/types";

const STATUS_TONE: Record<PurchaseStatus, string> = {
  ordered: "text-tinta-2",
  invoiced: "text-trigo-texto",
  received: "text-trigo-texto",
  complete: "text-accion",
};

const STATUSES = ["ordered", "invoiced", "received", "complete"] as const;

/** Columnas de compras; el proveedor es el título de la tarjeta en el celular. */
function purchaseColumns(party: (id: string | null) => string, hasInvoice: boolean, onOpen: (id: string) => void): Column<Purchase>[] {
  const cols: Column<Purchase>[] = [
    { id: "date", header: t("ui.cost.date"), cell: (p) => <span className="num">{fmtIsoDate(p.orderDate)}</span>, sort: (a, b) => a.orderDate.localeCompare(b.orderDate) },
    { id: "party", header: t("ui.purch.supplier"), mobile: "title", cell: (p) => <span className="font-medium">{party(p.partyId) || "—"}</span> },
  ];
  if (hasInvoice) cols.push({ id: "invoice", header: t("ui.purch.invoiceNumber"), hideBelow: "md", cell: (p) => <span className="text-tinta-2">{p.invoiceNumber ?? ""}</span> });
  cols.push(
    { id: "total", header: t("ui.purch.total"), align: "right", cell: (p) => fmtMoney(p.totalAmount, p.currency), sort: (a, b) => a.totalAmount - b.totalAmount },
    { id: "status", header: t("ui.purch.status"), hideBelow: "sm", cell: (p) => <span className={STATUS_TONE[p.status]}>{tk(`ui.purch.status_${p.status}`)}</span> },
    {
      id: "open",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "5rem",
      cell: (p) => (
        <Button size="sm" variant="quiet" aria-label={`${t("ui.purch.open")} ${fmtIsoDate(p.orderDate)}`} onClick={() => onOpen(p.id)}>
          {t("ui.purch.open")}
        </Button>
      ),
    },
  );
  return cols;
}

/** Compras: orden, factura del proveedor y recepción en depósito. */
export function PurchasesPanel() {
  const q = useQuery({ queryKey: ["erp", "purchases"], queryFn: () => get<Purchase[]>("/org/erp/purchases") });
  const parties = useParties();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const exp = useTableExport("compras");
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";
  const all = q.data ?? [];
  const rows = all.filter((p) => !status || p.status === status);
  const newButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      {t("ui.purch.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {all.length > 0 && <HeaderActions>{newButton}</HeaderActions>}
      {all.length === 0 ? (
        <EmptyState title={t("ui.empty.purchTitle")} action={newButton}>
          {t("ui.empty.purchBody")}
        </EmptyState>
      ) : (
        <>
          {exp.menu}
          <FilterBar sheet={false}>
            <Field label={t("ui.purch.status")}>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "", label: t("ui.cost.all") }, ...STATUSES.map((k) => ({ value: k, label: tk(`ui.purch.status_${k}`) }))]} />
            </Field>
          </FilterBar>
          <div ref={exp.ref}>
            <DataTable columns={purchaseColumns(party, all.some((p) => p.invoiceNumber), setOpen)} rows={rows} rowKey={(p) => p.id} caption={t("ui.admin.section_purchases")} empty={<EmptyState compact title={t("ui.erp.empty")} />} />
          </div>
        </>
      )}
      {creating && <NewPurchase onClose={() => setCreating(false)} />}
      {open && <PurchaseDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
