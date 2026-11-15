/**
 * Detalle de una compra (función 117): proveedor, fecha, líneas, total, factura, recepción y foto de la factura.
 * /org/erp/purchases/:id, POST .../invoice y .../receive, y /org/erp/photos/purchases/:id.
 */
import { useState } from "react";
import { Linking, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { PackageCheck, Receipt } from "lucide-react-native";
import { lineAmount, t, type Currency, type PurchaseStatus } from "@yvy/shared";
import { api } from "../../../src/lib/session";
import { showToast } from "../../../src/lib/toast";
import { AdminGate, k, today, useParties, useProductMap, useWarehouses } from "../../../src/office/adminKit";
import { isoShort, NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { invalidate } from "../../../src/office/cache";
import { fmtQty, fmtMoney } from "../../../src/office/money";
import { HAS_CAMERA, InvoicePhotoButton, type PickedPhoto } from "../../../src/office/invoicePhoto";
import { uploadInvoicePhoto } from "../../../src/office/invoiceUpload";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DateField, FormSheet, KeyValue, SelectField, TextField } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { Button, Row, SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

interface Line {
  id: string;
  productId: string | null;
  description: string | null;
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
  lines: Line[];
}

export default function PurchaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useOnline<Purchase>(id ? `/org/erp/purchases/${id}` : null);
  const parties = useParties();
  const warehouses = useWarehouses();
  const { byId } = useProductMap();
  const noSignal = useNoSignalReason();
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [inv, setInv] = useState({ number: "", date: today(), due: "" });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const receive = useOnlineMutation<{ warehouseId: string; date: string }, unknown>("POST", `/org/erp/purchases/${id}/receive`, { invalidate: ["/org/erp"] });
  const invoice = useOnlineMutation<Record<string, unknown>, unknown>("POST", `/org/erp/purchases/${id}/invoice`, { invalidate: ["/org/erp"] });

  const whs = warehouses.data ?? [];
  const wh = warehouseId || whs.find((w) => w.isDefault)?.id || whs[0]?.id || "";

  const attach = async (p: PickedPhoto) => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await uploadInvoicePhoto("purchases", id!, p);
      invalidate(["/org/erp"]);
      await q.refresh();
      showToast(t("ui.photoSaved"));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t("ui.photoUploadFailed"));
    } finally {
      setPhotoBusy(false);
    }
  };
  const view = async () => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const r = await api<{ url: string }>("GET", `/org/erp/photos/purchases/${id}`);
      await Linking.openURL(r.url);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t("office.loadFailed"));
    } finally {
      setPhotoBusy(false);
    }
  };
  const remove = async () => {
    setPhotoBusy(true);
    try {
      await api("DELETE", `/org/erp/photos/purchases/${id}`);
      invalidate(["/org/erp"]);
      await q.refresh();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t("office.loadFailed"));
    } finally {
      setPhotoBusy(false);
    }
  };

  const doReceive = async () => {
    const r = await receive.mutate({ warehouseId: wh, date: today() });
    if (r.ok) {
      showToast(t("ui.purchReceived"));
      void q.refresh();
    }
  };
  const doInvoice = async () => {
    if (!inv.number.trim()) return setFormError(t("office.admNeedsInvoiceNumber"));
    if (!inv.date) return setFormError(t("office.admNeedsDate"));
    setFormError(null);
    const r = await invoice.mutate({ invoiceNumber: inv.number.trim(), invoiceDate: inv.date, dueDate: inv.due || null });
    if (r.ok) {
      setInvoiceOpen(false);
      showToast(t("ui.erpSaved"));
      void q.refresh();
    }
  };

  const p = q.data;
  const action = !p
    ? undefined
    : p.receivedAt === null && wh
      ? { label: t("ui.purchReceive"), icon: PackageCheck, onPress: doReceive, loading: receive.pending, disabled: !!noSignal }
      : !p.invoiceNumber
        ? { label: t("ui.purchSaveInvoice"), icon: Receipt, onPress: () => setInvoiceOpen(true), disabled: !!noSignal }
        : undefined;

  return (
    <AdminGate need="manage" title={t("ui.purchDetail")}>
      <OfficeScreen title={t("ui.purchDetail")} subtitle={p ? (parties.data?.find((x) => x.id === p.partyId)?.name ?? undefined) : undefined} query={q} action={action}>
        <NoSignalNote />
        <OnlineState query={q} empty={{ title: t("ui.erpEmpty") }} isEmpty={(d) => !d}>
          {(d) => (
            <>
              <KeyValue
                rows={[
                  { label: t("ui.costDate"), value: isoShort(d.orderDate) },
                  { label: t("ui.purchTotal"), value: fmtMoney(d.totalAmount, d.currency) },
                  { label: t("ui.purchStatus"), value: t(k(`ui.purchStatus_${d.status}`)) },
                  ...(d.invoiceNumber ? [{ label: t("ui.purchInvoice"), value: [d.invoiceNumber, d.invoiceDate ? isoShort(d.invoiceDate) : null].filter(Boolean).join(" · ") }] : []),
                  ...(d.dueDate ? [{ label: t("ui.purchDueLabel"), value: isoShort(d.dueDate) }] : []),
                  { label: t("ui.purchReception"), value: d.receivedAt ? t("ui.purchReceivedOn", { date: isoShort(d.receivedAt.slice(0, 10)) }) : t("office.admNotReceived") },
                ]}
              />
              <SectionHeader title={t("office.admLines")} />
              {d.lines.map((l) => {
                const prod = l.productId ? byId.get(l.productId) : undefined;
                const qty = l.receivedQty ?? l.qty;
                return <Row key={l.id} title={prod?.name ?? l.description ?? "—"} subtitle={`${fmtQty(qty, prod?.unit)} × ${fmtMoney(l.unitPrice, d.currency)}${l.lot ? ` · ${t("ui.expiringLot", { lot: l.lot })}` : ""}`} right={fmtMoney(lineAmount(qty, l.unitPrice), d.currency)} />;
              })}
              <SectionHeader title={t("ui.purchInvoice")} />
              <View style={{ gap: 12 }}>
                {d.photoPath ? (
                  <>
                    <Button kind="secondary" title={t("ui.photoView")} onPress={view} loading={photoBusy} />
                    <Button kind="text" title={t("ui.photoRemove")} onPress={remove} disabled={photoBusy || !!noSignal} />
                  </>
                ) : (
                  <InvoicePhotoButton title={HAS_CAMERA ? t("office.admTakeInvoicePhoto") : t("ui.photoAttach")} onPick={attach} loading={photoBusy} disabled={!!noSignal} />
                )}
                {photoError ? (
                  <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro }]}>
                    {photoError}
                  </Text>
                ) : null}
              </View>
              {d.receivedAt === null && whs.length > 0 ? (
                <>
                  <SectionHeader title={t("ui.purchReception")} />
                  <SelectField label={t("ui.stockWarehouse")} value={wh} options={whs.map((w) => ({ value: w.id, label: w.name }))} onChange={setWarehouseId} />
                  {receive.error ? (
                    <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
                      {receive.error}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </OnlineState>
        <FormSheet visible={invoiceOpen} title={t("ui.purchInvoice")} onClose={() => setInvoiceOpen(false)} onSubmit={doInvoice} submitLabel={t("ui.save")} pending={invoice.pending} error={formError ?? invoice.error}>
          <TextField label={t("ui.purchInvoiceNumber")} value={inv.number} onChangeText={(v) => setInv({ ...inv, number: v })} maxLength={40} autoCapitalize="none" />
          <DateField label={t("ui.costDate")} value={inv.date} onChange={(v) => setInv({ ...inv, date: v })} />
          <DateField label={t("ui.purchDueLabel")} value={inv.due} onChange={(v) => setInv({ ...inv, due: v })} />
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
