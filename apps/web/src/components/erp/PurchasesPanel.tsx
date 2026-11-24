/** Compras: orden, factura del proveedor y recepción en depósito (E-33). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COST_CATEGORIES, CURRENCIES, lineAmount, localDate, toMinor, type Currency, type PurchaseStatus } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtMoney, fmtQty } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { useProducts } from "../../lib/products";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, FilterBar, Form, FormFooter, Input, Modal, Select, Spinner, toast } from "../ui";
import { InvoicePhoto } from "./InvoicePhoto";
import { useParties } from "./PartiesPanel";
import { useWarehouses } from "./WarehousesPanel";
import { HeaderActions, useGoSection, useTableExport } from "./adminSlot";

interface Line {
  id: string;
  productId: string | null;
  description: string | null;
  category: string | null;
  qty: number;
  receivedQty: number | null;
  unitPrice: number;
  lot: string | null;
  expiresOn: string | null;
}
interface Purchase {
  id: string;
  partyId: string | null;
  orderDate: string;
  currency: Currency;
  totalAmount: number;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  receivedAt: string | null;
  photoPath: string | null;
  status: PurchaseStatus;
  lines?: Line[];
}

const STATUS_TONE: Record<PurchaseStatus, string> = {
  ordered: "text-tinta-2",
  invoiced: "text-trigo-texto",
  received: "text-trigo-texto",
  complete: "text-accion",
};

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
  const hasInvoice = all.some((p) => p.invoiceNumber);
  const columns: Column<Purchase>[] = [
    { id: "date", header: t("ui.cost.date"), cell: (p) => <span className="num">{fmtIsoDate(p.orderDate)}</span>, sort: (a, b) => a.orderDate.localeCompare(b.orderDate) },
    { id: "party", header: t("ui.purch.supplier"), cell: (p) => <span className="font-medium">{party(p.partyId) || "—"}</span> },
    ...(hasInvoice ? [{ id: "invoice", header: t("ui.purch.invoiceNumber"), hideBelow: "md", cell: (p: Purchase) => <span className="text-tinta-2">{p.invoiceNumber ?? ""}</span> } satisfies Column<Purchase>] : []),
    { id: "total", header: t("ui.purch.total"), align: "right", cell: (p) => fmtMoney(p.totalAmount, p.currency), sort: (a, b) => a.totalAmount - b.totalAmount },
    { id: "status", header: t("ui.purch.status"), hideBelow: "sm", cell: (p) => <span className={STATUS_TONE[p.status]}>{tk(`ui.purch.status_${p.status}`)}</span> },
    {
      id: "open",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "5rem",
      cell: (p) => (
        <Button size="sm" variant="quiet" aria-label={`${t("ui.purch.open")} ${fmtIsoDate(p.orderDate)}`} onClick={() => setOpen(p.id)}>
          {t("ui.purch.open")}
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {all.length > 0 && (
        <HeaderActions>
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t("ui.purch.new")}
          </Button>
        </HeaderActions>
      )}
      {all.length === 0 ? (
        <EmptyState
          title={t("ui.empty.purchTitle")}
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t("ui.purch.new")}
            </Button>
          }
        >
          {t("ui.empty.purchBody")}
        </EmptyState>
      ) : (
        <>
          {exp.menu}
          <FilterBar>
            <Select
              aria-label={t("ui.purch.status")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[{ value: "", label: t("ui.cost.all") }, ...(["ordered", "invoiced", "received", "complete"] as const).map((k) => ({ value: k, label: tk(`ui.purch.status_${k}`) }))]}
            />
          </FilterBar>
          <div ref={exp.ref}>
            <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} caption={t("ui.admin.section_purchases")} empty={<EmptyState compact title={t("ui.erp.empty")} />} />
          </div>
        </>
      )}
      {creating && <NewPurchase onClose={() => setCreating(false)} />}
      {open && <PurchaseDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

interface LineForm {
  productId: string;
  description: string;
  category: string;
  qty: string;
  unitPrice: string;
}
const blankLine = (productId: string): LineForm => ({ productId, description: "", category: "other", qty: "1", unitPrice: "" });

function NewPurchase({ onClose }: { onClose: () => void }) {
  const products = useProducts();
  const parties = useParties();
  const farms = useFarms();
  const qc = useQueryClient();
  const [partyId, setPartyId] = useState("");
  const [farmId, setFarmId] = useState("");
  const [orderDate, setOrderDate] = useState(localDate(Date.now()));
  const [currency, setCurrency] = useState<Currency>("PYG");
  const [lines, setLines] = useState<LineForm[]>([blankLine(products.data?.[0]?.id ?? "")]);
  const setLine = (i: number, patch: Partial<LineForm>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const save = useMutation({
    mutationFn: () =>
      post("/org/erp/purchases", {
        partyId: partyId || null,
        farmId: farmId || null,
        orderDate,
        currency,
        lines: lines.map((l) => ({
          productId: l.productId || null,
          description: l.productId ? null : l.description || null,
          category: l.productId ? null : l.category,
          qty: Number(l.qty),
          unitPrice: toMinor(Number(l.unitPrice), currency),
        })),
      }),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const total = lines.reduce((a, l) => a + lineAmount(Number(l.qty) || 0, toMinor(Number(l.unitPrice) || 0, currency)), 0);
  return (
    <Modal title={t("ui.purch.new")} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
        <Field label={t("ui.purch.supplier")}>
          <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} options={[{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label={t("ui.cost.farm")}>
          <Select value={farmId} onChange={(e) => setFarmId(e.target.value)} options={[{ value: "", label: "—" }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
        <Field label={t("ui.cost.date")}>
          <Input required type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field label={t("ui.common.currency")}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <div className="col-span-2 flex flex-col gap-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-6 items-end gap-2 border-b border-linea pb-2">
              <div className="col-span-3">
                <Select
                  value={l.productId}
                  onChange={(e) => setLine(i, { productId: e.target.value })}
                  options={[{ value: "", label: t("ui.purch.expense") }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
                />
              </div>
              <Input type="number" required min={0} step="any" aria-label={t("ui.purch.qty")} placeholder={t("ui.purch.qty")} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              <Input type="number" required min={0} step="any" aria-label={t("ui.purch.unitPrice")} placeholder={t("ui.purch.unitPrice")} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <button type="button" className="cursor-pointer text-tinta-2 hover:text-peligro" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))}>
                {t("ui.common.delete")}
              </button>
              {!l.productId && (
                <>
                  <div className="col-span-3">
                    <Input required maxLength={200} placeholder={t("ui.purch.description")} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  </div>
                  <div className="col-span-3">
                    <Select value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} options={COST_CATEGORIES.filter((c) => c !== "sale").map((c) => ({ value: c, label: tk(`ui.cost.category_${c}`) }))} />
                  </div>
                </>
              )}
            </div>
          ))}
          <div>
            <Button type="button" variant="secondary" disabled={lines.length >= 20} onClick={() => setLines([...lines, blankLine(products.data?.[0]?.id ?? "")])}>
              {t("ui.purch.addLine")}
            </Button>
          </div>
        </div>
        <div className="col-span-2 num text-right font-medium">{fmtMoney(total, currency)}</div>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}

function PurchaseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["erp", "purchase", id], queryFn: () => get<Purchase & { lines: Line[] }>(`/org/erp/purchases/${id}`) });
  const products = useProducts();
  const warehouses = useWarehouses();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["erp"] });
  const [invoice, setInvoice] = useState({ number: "", date: localDate(Date.now()), due: "" });
  const [warehouseId, setWarehouseId] = useState("");
  const [received, setReceived] = useState<Record<string, { qty: string; lot: string; expiresOn: string }>>({});
  const [confirm, setConfirm] = useState<"unreceive" | "delete" | null>(null);
  const goSection = useGoSection();
  const doInvoice = useMutation({
    mutationFn: () => post(`/org/erp/purchases/${id}/invoice`, { invoiceNumber: invoice.number, invoiceDate: invoice.date, dueDate: invoice.due || null }),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      refresh();
    },
  });
  const doReceive = useMutation({
    mutationFn: () =>
      post(`/org/erp/purchases/${id}/receive`, {
        warehouseId: warehouseId || warehouses.data?.[0]?.id,
        date: localDate(Date.now()),
        lines: Object.entries(received).map(([lineId, r]) => ({
          lineId,
          qty: r.qty === "" ? undefined : Number(r.qty),
          lot: r.lot || null,
          expiresOn: r.expiresOn || null,
        })),
      }),
    onSuccess: () => {
      toast(t("ui.purch.received"));
      refresh();
    },
  });
  const undo = useMutation({
    mutationFn: () => del(`/org/erp/purchases/${id}/reception`),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/org/erp/purchases/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      refresh();
      onClose();
    },
  });
  const p = q.data;
  const prod = (pid: string | null) => products.data?.find((x) => x.id === pid);
  const setRow = (lineId: string, patch: Partial<{ qty: string; lot: string; expiresOn: string }>) =>
    setReceived({ ...received, [lineId]: { qty: "", lot: "", expiresOn: "", ...received[lineId], ...patch } });
  return (
    <Modal title={t("ui.purch.detail")} onClose={onClose}>
      {!p ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {p.lines.map((l) => (
                  <tr key={l.id} className="border-b border-linea align-top">
                    <td className="py-2 pr-3 font-medium">
                      {prod(l.productId)?.name ?? l.description}
                      {l.productId && p.receivedAt === null && (
                        <div className="mt-1 flex gap-2">
                          <Input aria-label={t("ui.purch.qtyReceived")} placeholder={t("ui.purch.qtyReceived")} type="number" min={0} step="any" value={received[l.id]?.qty ?? ""} onChange={(e) => setRow(l.id, { qty: e.target.value })} />
                          <Input aria-label={t("ui.purch.lot")} placeholder={t("ui.purch.lot")} value={received[l.id]?.lot ?? l.lot ?? ""} onChange={(e) => setRow(l.id, { lot: e.target.value })} />
                          <Input aria-label={t("ui.purch.expires")} type="date" value={received[l.id]?.expiresOn ?? l.expiresOn ?? ""} onChange={(e) => setRow(l.id, { expiresOn: e.target.value })} />
                        </div>
                      )}
                    </td>
                    <td className="num py-2 pr-3 text-right">{fmtQty(l.receivedQty ?? l.qty, l.productId ? tk(`fields.product.unit_${prod(l.productId)?.unit ?? "l"}`) : "")}</td>
                    <td className="num py-2 pr-3 text-right">{fmtMoney(l.unitPrice, p.currency)}</td>
                    <td className="num py-2 text-right">{fmtMoney(lineAmount(l.receivedQty ?? l.qty, l.unitPrice), p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="num text-right font-medium">{fmtMoney(p.totalAmount, p.currency)}</div>
          <div className="flex flex-col gap-2 border-t border-linea pt-3">
            <h3 className="text-base font-semibold">{t("ui.purch.invoice")}</h3>
            {p.invoiceNumber ? (
              <p className="text-sm">
                {p.invoiceNumber} · {p.invoiceDate ? fmtIsoDate(p.invoiceDate) : ""}
                {p.dueDate ? " · " + t("ui.purch.due", { date: fmtIsoDate(p.dueDate) }) : ""}
              </p>
            ) : (
              <Form className="grid grid-cols-3 gap-2" onSubmit={() => doInvoice.mutate()}>
                <Input required maxLength={40} placeholder={t("ui.purch.invoiceNumber")} value={invoice.number} onChange={(e) => setInvoice({ ...invoice, number: e.target.value })} />
                <Input required type="date" aria-label={t("ui.cost.date")} value={invoice.date} onChange={(e) => setInvoice({ ...invoice, date: e.target.value })} />
                <Input type="date" aria-label={t("ui.purch.dueLabel")} value={invoice.due} onChange={(e) => setInvoice({ ...invoice, due: e.target.value })} />
                <div className="col-span-3">
                  <Button type="submit" variant="secondary" disabled={doInvoice.isPending}>
                    {t("ui.purch.saveInvoice")}
                  </Button>
                </div>
              </Form>
            )}
            <InvoicePhoto kind="purchases" id={id} hasPhoto={!!p.photoPath} />
            {doInvoice.error ? <ErrorBox error={doInvoice.error} /> : null}
          </div>
          <div className="flex flex-col gap-2 border-t border-linea pt-3">
            <h3 className="text-base font-semibold">{t("ui.purch.reception")}</h3>
            {p.receivedAt ? (
              <p className="text-sm">{t("ui.purch.receivedOn", { date: fmtIsoDate(p.receivedAt) })}</p>
            ) : (warehouses.data ?? []).length === 0 ? (
              <EmptyState compact title={t("ui.stock.needWarehouseTitle")} action={<Button variant="primary" onClick={() => goSection("warehouses")}>{t("ui.warehouse.load")}</Button>}>
                {t("ui.stock.needWarehouseBody")}
              </EmptyState>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  value={warehouseId || warehouses.data?.[0]?.id || ""}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
                />
                <Button variant="primary" disabled={doReceive.isPending} onClick={() => doReceive.mutate()}>
                  {t("ui.purch.receive")}
                </Button>
              </div>
            )}
            {doReceive.error ? <ErrorBox error={doReceive.error} /> : null}
          </div>
          <div className="flex gap-4 border-t border-linea pt-3 text-sm text-tinta-2">
            {p.receivedAt ? (
              <button className="cursor-pointer underline-offset-4 hover:text-peligro hover:underline" onClick={() => setConfirm("unreceive")}>
                {t("ui.purch.unreceive")}
              </button>
            ) : (
              <button className="cursor-pointer underline-offset-4 hover:text-peligro hover:underline" onClick={() => setConfirm("delete")}>
                {t("ui.common.delete")}
              </button>
            )}
          </div>
        </div>
      )}
      {confirm && (
        <ConfirmModal
          title={t(confirm === "delete" ? "ui.common.delete" : "ui.purch.unreceive")}
          message={confirm === "delete" ? t("ui.purch.deleteConfirm") : t("ui.purch.unreceiveConfirm")}
          confirmLabel={t(confirm === "delete" ? "ui.common.delete" : "ui.purch.unreceive")}
          pending={undo.isPending || remove.isPending}
          error={undo.error ?? remove.error}
          onConfirm={() => (confirm === "delete" ? remove.mutate() : undo.mutate())}
          onClose={() => setConfirm(null)}
        />
      )}
    </Modal>
  );
}
