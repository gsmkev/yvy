/** Compras: orden, factura del proveedor y recepción en depósito (E-33). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COST_CATEGORIES, CURRENCIES, lineAmount, localDate, toMinor, type Currency, type PurchaseStatus } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtMoney, fmtQty } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { useProducts } from "../ProductsPanel";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { InvoicePhoto } from "./InvoicePhoto";
import { useParties } from "./PartiesPanel";
import { useWarehouses } from "./WarehousesPanel";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions } from "./adminSlot";

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
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";
  return (
    <div className="flex flex-col gap-4">
      <HeaderActions>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t("ui.purchNew")}
        </Button>
      </HeaderActions>
      {(q.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <ExportableTable name="compras">
            <table className="w-full text-sm">
              <tbody>
                {(q.data ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-linea">
                    <td className="num py-2.5 pr-4">{fmtIsoDate(p.orderDate)}</td>
                    <td className="py-2.5 pr-4 font-medium">{party(p.partyId) || "—"}</td>
                    <td className="py-2.5 pr-4 text-tinta-2">{p.invoiceNumber ?? ""}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtMoney(p.totalAmount, p.currency)}</td>
                    <td className={`py-2.5 pr-4 ${STATUS_TONE[p.status]}`}>{tk(`ui.purchStatus_${p.status}`)}</td>
                    <td className="py-2.5 text-right">
                      <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-surco hover:underline" onClick={() => setOpen(p.id)}>
                        {t("ui.purchOpen")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
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
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const total = lines.reduce((a, l) => a + lineAmount(Number(l.qty) || 0, toMinor(Number(l.unitPrice) || 0, currency)), 0);
  return (
    <Modal title={t("ui.purchNew")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.purchSupplier")}>
          <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} options={[{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label={t("ui.costFarm")}>
          <Select value={farmId} onChange={(e) => setFarmId(e.target.value)} options={[{ value: "", label: "—" }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
        <Field label={t("ui.costDate")}>
          <Input required type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field label={t("ui.currency")}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <div className="col-span-2 flex flex-col gap-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-6 items-end gap-2 border-b border-linea pb-2">
              <div className="col-span-3">
                <Select
                  value={l.productId}
                  onChange={(e) => setLine(i, { productId: e.target.value })}
                  options={[{ value: "", label: t("ui.purchExpense") }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
                />
              </div>
              <Input type="number" required min={0} step="any" aria-label={t("ui.purchQty")} placeholder={t("ui.purchQty")} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              <Input type="number" required min={0} step="any" aria-label={t("ui.purchUnitPrice")} placeholder={t("ui.purchUnitPrice")} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <button type="button" className="cursor-pointer text-tinta-2 hover:text-peligro" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))}>
                {t("ui.delete")}
              </button>
              {!l.productId && (
                <>
                  <div className="col-span-3">
                    <Input required maxLength={200} placeholder={t("ui.purchDescription")} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  </div>
                  <div className="col-span-3">
                    <Select value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} options={COST_CATEGORIES.filter((c) => c !== "sale").map((c) => ({ value: c, label: tk(`ui.costCategory_${c}`) }))} />
                  </div>
                </>
              )}
            </div>
          ))}
          <div>
            <Button type="button" variant="secondary" disabled={lines.length >= 20} onClick={() => setLines([...lines, blankLine(products.data?.[0]?.id ?? "")])}>
              {t("ui.purchAddLine")}
            </Button>
          </div>
        </div>
        <div className="col-span-2 num text-right font-medium">{fmtMoney(total, currency)}</div>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
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
  const doInvoice = useMutation({
    mutationFn: () => post(`/org/erp/purchases/${id}/invoice`, { invoiceNumber: invoice.number, invoiceDate: invoice.date, dueDate: invoice.due || null }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
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
      toast(t("ui.purchReceived"));
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
      toast(t("ui.erpDeleted"));
      refresh();
      onClose();
    },
  });
  const p = q.data;
  const prod = (pid: string | null) => products.data?.find((x) => x.id === pid);
  const setRow = (lineId: string, patch: Partial<{ qty: string; lot: string; expiresOn: string }>) =>
    setReceived({ ...received, [lineId]: { qty: "", lot: "", expiresOn: "", ...received[lineId], ...patch } });
  return (
    <Modal title={t("ui.purchDetail")} onClose={onClose}>
      {!p ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <ExportableTable name="compra-detalle">
            <table className="w-full text-sm">
              <tbody>
                {p.lines.map((l) => (
                  <tr key={l.id} className="border-b border-linea align-top">
                    <td className="py-2 pr-3 font-medium">
                      {prod(l.productId)?.name ?? l.description}
                      {l.productId && p.receivedAt === null && (
                        <div className="mt-1 flex gap-2">
                          <Input aria-label={t("ui.purchQtyReceived")} placeholder={t("ui.purchQtyReceived")} type="number" min={0} step="any" value={received[l.id]?.qty ?? ""} onChange={(e) => setRow(l.id, { qty: e.target.value })} />
                          <Input aria-label={t("ui.purchLot")} placeholder={t("ui.purchLot")} value={received[l.id]?.lot ?? l.lot ?? ""} onChange={(e) => setRow(l.id, { lot: e.target.value })} />
                          <Input aria-label={t("ui.purchExpires")} type="date" value={received[l.id]?.expiresOn ?? l.expiresOn ?? ""} onChange={(e) => setRow(l.id, { expiresOn: e.target.value })} />
                        </div>
                      )}
                    </td>
                    <td className="num py-2 pr-3 text-right">{fmtQty(l.receivedQty ?? l.qty, l.productId ? tk(`fields.productUnit_${prod(l.productId)?.unit ?? "l"}`) : "")}</td>
                    <td className="num py-2 pr-3 text-right">{fmtMoney(l.unitPrice, p.currency)}</td>
                    <td className="num py-2 text-right">{fmtMoney(lineAmount(l.receivedQty ?? l.qty, l.unitPrice), p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
          <div className="num text-right font-medium">{fmtMoney(p.totalAmount, p.currency)}</div>
          <div className="flex flex-col gap-2 border-t border-linea pt-3">
            <h3 className="text-base font-semibold">{t("ui.purchInvoice")}</h3>
            {p.invoiceNumber ? (
              <p className="text-sm">
                {p.invoiceNumber} · {p.invoiceDate ? fmtIsoDate(p.invoiceDate) : ""}
                {p.dueDate ? ` · ${t("ui.purchDue", { date: fmtIsoDate(p.dueDate) })}` : ""}
              </p>
            ) : (
              <form
                className="grid grid-cols-3 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  doInvoice.mutate();
                }}
              >
                <Input required maxLength={40} placeholder={t("ui.purchInvoiceNumber")} value={invoice.number} onChange={(e) => setInvoice({ ...invoice, number: e.target.value })} />
                <Input required type="date" aria-label={t("ui.costDate")} value={invoice.date} onChange={(e) => setInvoice({ ...invoice, date: e.target.value })} />
                <Input type="date" aria-label={t("ui.purchDueLabel")} value={invoice.due} onChange={(e) => setInvoice({ ...invoice, due: e.target.value })} />
                <div className="col-span-3">
                  <Button type="submit" variant="secondary" disabled={doInvoice.isPending}>
                    {t("ui.purchSaveInvoice")}
                  </Button>
                </div>
              </form>
            )}
            <InvoicePhoto kind="purchases" id={id} hasPhoto={!!p.photoPath} />
            {doInvoice.error ? <ErrorBox error={doInvoice.error} /> : null}
          </div>
          <div className="flex flex-col gap-2 border-t border-linea pt-3">
            <h3 className="text-base font-semibold">{t("ui.purchReception")}</h3>
            {p.receivedAt ? (
              <p className="text-sm">{t("ui.purchReceivedOn", { date: fmtIsoDate(p.receivedAt) })}</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  value={warehouseId || warehouses.data?.[0]?.id || ""}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
                />
                <Button variant="primary" disabled={doReceive.isPending || !(warehouses.data ?? []).length} onClick={() => doReceive.mutate()}>
                  {t("ui.purchReceive")}
                </Button>
              </div>
            )}
            {doReceive.error ? <ErrorBox error={doReceive.error} /> : null}
          </div>
          <div className="flex gap-4 border-t border-linea pt-3 text-sm text-tinta-2">
            {p.receivedAt ? (
              <button className="cursor-pointer underline-offset-4 hover:text-peligro hover:underline" onClick={() => setConfirm("unreceive")}>
                {t("ui.purchUnreceive")}
              </button>
            ) : (
              <button className="cursor-pointer underline-offset-4 hover:text-peligro hover:underline" onClick={() => setConfirm("delete")}>
                {t("ui.delete")}
              </button>
            )}
          </div>
        </div>
      )}
      {confirm && (
        <ConfirmModal
          title={t(confirm === "delete" ? "ui.delete" : "ui.purchUnreceive")}
          message={confirm === "delete" ? t("ui.purchDeleteConfirm") : t("ui.purchUnreceiveConfirm")}
          confirmLabel={t(confirm === "delete" ? "ui.delete" : "ui.purchUnreceive")}
          pending={undo.isPending || remove.isPending}
          error={undo.error ?? remove.error}
          onConfirm={() => (confirm === "delete" ? remove.mutate() : undo.mutate())}
          onClose={() => setConfirm(null)}
        />
      )}
    </Modal>
  );
}
