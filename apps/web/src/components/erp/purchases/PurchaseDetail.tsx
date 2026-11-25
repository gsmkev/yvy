/** Detalle de una compra: renglones, factura del proveedor, recepción en depósito y baja. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lineAmount, localDate } from "@yvy/shared";
import { del, get, post } from "../../../lib/api";
import { fmtIsoDate } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { fmtMoney, fmtQty } from "../../../lib/money";
import { useProducts } from "../../../lib/products";
import { Button, ConfirmModal, EmptyState, ErrorBox, Form, Input, Modal, Select, Spinner, toast } from "../../ui";
import { InvoicePhoto } from "../InvoicePhoto";
import { useWarehouses } from "../WarehousesPanel";
import { useGoSection } from "../adminSlot";
import type { Line, Purchase } from "./types";

type Received = Record<string, { qty: string; lot: string; expiresOn: string }>;
type Detail = Purchase & { lines: Line[] };
type RowPatch = Partial<Received[string]>;

/** Acciones de la compra: facturar, recibir, deshacer la recepción y borrar. */
function usePurchaseActions(id: string, onClose: () => void) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["erp"] });
  const saved = (msg: string) => () => {
    toast(msg);
    refresh();
  };
  const invoice = useMutation({
    mutationFn: (f: { number: string; date: string; due: string }) => post(`/org/erp/purchases/${id}/invoice`, { invoiceNumber: f.number, invoiceDate: f.date, dueDate: f.due || null }),
    onSuccess: saved(t("ui.erp.saved")),
  });
  const receive = useMutation({
    mutationFn: (b: { warehouseId: string | undefined; received: Received }) =>
      post(`/org/erp/purchases/${id}/receive`, {
        warehouseId: b.warehouseId,
        date: localDate(Date.now()),
        lines: Object.entries(b.received).map(([lineId, r]) => ({ lineId, qty: r.qty === "" ? undefined : Number(r.qty), lot: r.lot || null, expiresOn: r.expiresOn || null })),
      }),
    onSuccess: saved(t("ui.purch.received")),
  });
  const undo = useMutation({ mutationFn: () => del(`/org/erp/purchases/${id}/reception`), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => del(`/org/erp/purchases/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      refresh();
      onClose();
    },
  });
  return { invoice, receive, undo, remove };
}

/** Renglones de la compra; si falta recibirla, cada uno con su cantidad, lote y vencimiento. */
function PurchaseLines({ p, received, onRow }: { p: Detail; received: Received; onRow: (lineId: string, patch: RowPatch) => void }) {
  const products = useProducts();
  const prod = (pid: string | null) => products.data?.find((x) => x.id === pid);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {p.lines.map((l) => (
            <tr key={l.id} className="border-b border-linea align-top">
              <td className="py-2 pr-3 font-medium">
                {prod(l.productId)?.name ?? l.description}
                {l.productId && p.receivedAt === null && (
                  <div className="mt-1 flex gap-2">
                    <Input aria-label={t("ui.purch.qtyReceived")} placeholder={t("ui.purch.qtyReceived")} type="number" min={0} step="any" value={received[l.id]?.qty ?? ""} onChange={(e) => onRow(l.id, { qty: e.target.value })} />
                    <Input aria-label={t("ui.purch.lot")} placeholder={t("ui.purch.lot")} value={received[l.id]?.lot ?? l.lot ?? ""} onChange={(e) => onRow(l.id, { lot: e.target.value })} />
                    <Input aria-label={t("ui.purch.expires")} type="date" value={received[l.id]?.expiresOn ?? l.expiresOn ?? ""} onChange={(e) => onRow(l.id, { expiresOn: e.target.value })} />
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
  );
}

/** Factura del proveedor: sus datos si ya está cargada, o el formulario para cargarla. */
function InvoiceSection({ p, id, invoice }: { p: Detail; id: string; invoice: ReturnType<typeof usePurchaseActions>["invoice"] }) {
  const [f, setF] = useState({ number: "", date: localDate(Date.now()), due: "" });
  const shown = [p.invoiceNumber, p.invoiceDate ? fmtIsoDate(p.invoiceDate) : "", p.dueDate ? t("ui.purch.due", { date: fmtIsoDate(p.dueDate) }) : ""].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-2 border-t border-linea pt-3">
      <h3 className="text-base font-semibold">{t("ui.purch.invoice")}</h3>
      {p.invoiceNumber ? (
        <p className="text-sm">{shown}</p>
      ) : (
        <Form className="grid grid-cols-3 gap-2" onSubmit={() => invoice.mutate(f)}>
          <Input required maxLength={40} placeholder={t("ui.purch.invoiceNumber")} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
          <Input required type="date" aria-label={t("ui.cost.date")} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Input type="date" aria-label={t("ui.purch.dueLabel")} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          <div className="col-span-3">
            <Button type="submit" variant="secondary" disabled={invoice.isPending}>
              {t("ui.purch.saveInvoice")}
            </Button>
          </div>
        </Form>
      )}
      <InvoicePhoto kind="purchases" id={id} hasPhoto={!!p.photoPath} />
      {invoice.error ? <ErrorBox error={invoice.error} /> : null}
    </div>
  );
}

/** Recepción en depósito: la fecha si ya se recibió, o el depósito y el botón para recibir. */
function ReceptionSection({ p, received, receive }: { p: Detail; received: Received; receive: ReturnType<typeof usePurchaseActions>["receive"] }) {
  const warehouses = useWarehouses();
  const goSection = useGoSection();
  const [warehouseId, setWarehouseId] = useState("");
  const list = warehouses.data ?? [];
  const chosen = warehouseId || list[0]?.id || "";
  let body;
  if (p.receivedAt) {
    body = <p className="text-sm">{t("ui.purch.receivedOn", { date: fmtIsoDate(p.receivedAt) })}</p>;
  } else if (list.length === 0) {
    body = (
      <EmptyState compact title={t("ui.stock.needWarehouseTitle")} action={<Button variant="primary" onClick={() => goSection("warehouses")}>{t("ui.warehouse.load")}</Button>}>
        {t("ui.stock.needWarehouseBody")}
      </EmptyState>
    );
  } else {
    body = (
      <div className="flex flex-wrap items-end gap-2">
        <Select value={chosen} onChange={(e) => setWarehouseId(e.target.value)} options={list.map((w) => ({ value: w.id, label: w.name }))} />
        <Button variant="primary" disabled={receive.isPending} onClick={() => receive.mutate({ warehouseId: warehouseId || list[0]?.id, received })}>
          {t("ui.purch.receive")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-linea pt-3">
      <h3 className="text-base font-semibold">{t("ui.purch.reception")}</h3>
      {body}
      {receive.error ? <ErrorBox error={receive.error} /> : null}
    </div>
  );
}

/** Detalle de una compra dentro de un diálogo; `id` es la compra abierta. */
export function PurchaseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["erp", "purchase", id], queryFn: () => get<Detail>(`/org/erp/purchases/${id}`) });
  const [received, setReceived] = useState<Received>({});
  const [confirm, setConfirm] = useState<"unreceive" | "delete" | null>(null);
  const { invoice, receive, undo, remove } = usePurchaseActions(id, onClose);
  const p = q.data;
  const onRow = (lineId: string, patch: RowPatch) => setReceived({ ...received, [lineId]: { qty: "", lot: "", expiresOn: "", ...received[lineId], ...patch } });
  const action = p?.receivedAt ? "unreceive" : "delete";
  const actionLabel = t(action === "delete" ? "ui.common.delete" : "ui.purch.unreceive");
  return (
    <Modal title={t("ui.purch.detail")} onClose={onClose}>
      {!p ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <PurchaseLines p={p} received={received} onRow={onRow} />
          <div className="num text-right font-medium">{fmtMoney(p.totalAmount, p.currency)}</div>
          <InvoiceSection p={p} id={id} invoice={invoice} />
          <ReceptionSection p={p} received={received} receive={receive} />
          <div className="flex gap-4 border-t border-linea pt-3 text-sm text-tinta-2">
            <button className="cursor-pointer underline-offset-4 hover:text-peligro hover:underline" onClick={() => setConfirm(action)}>
              {actionLabel}
            </button>
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
          onConfirm={() => (confirm === "delete" ? remove.mutate() : undo.mutate(undefined, { onSuccess: () => setConfirm(null) }))}
          onClose={() => setConfirm(null)}
        />
      )}
    </Modal>
  );
}
