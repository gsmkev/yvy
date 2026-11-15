/**
 * Alta rápida de una compra en el campo (función 117): proveedor (lista o nuevo), fecha, líneas, depósito de
 * recepción y foto de la factura con la cámara. POST /org/erp/purchases y, según lo cargado, .../invoice, .../receive
 * y la foto (URL firmada de /org/erp/photos/purchases/:id). Nada se guarda en el celular.
 */
import { useState } from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import { Plus, Trash2 } from "lucide-react-native";
import { lineAmount, t, toMinor, type Currency } from "@yvy/shared";
import { showToast } from "../../../src/lib/toast";
import { AdminGate, CURRENCY_OPTIONS, today, unitOf, useParties, useProductMap, useWarehouses } from "../../../src/office/adminKit";
import { invalidate } from "../../../src/office/cache";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { parseDecimal } from "../../../src/office/format";
import { HAS_CAMERA, InvoicePhotoButton, type PickedPhoto } from "../../../src/office/invoicePhoto";
import { uploadInvoicePhoto } from "../../../src/office/invoiceUpload";
import { fmtMoney } from "../../../src/office/money";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { DateField, FormSheet, Segmented, SelectField, TextField } from "../../../src/office/ui";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { Button, SectionHeader, Text } from "../../../src/ui/kit";
import { C, RADIUS, T } from "../../../src/ui/theme";

interface LineDraft {
  productId: string;
  description: string;
  qty: string;
  price: string;
}
const blankLine = (): LineDraft => ({ productId: "", description: "", qty: "", price: "" });
const NEW = "__new__";

export default function PurchaseNew() {
  const parties = useParties();
  const warehouses = useWarehouses();
  const { products, byId } = useProductMap();
  const noSignal = useNoSignalReason();
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(today());
  const [currency, setCurrency] = useState<Currency>("PYG");
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newParty, setNewParty] = useState<{ name: string; ruc: string } | null>(null);
  const [partyError, setPartyError] = useState<string | null>(null);
  const createParty = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/parties", { invalidate: ["/org/erp"] });
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/purchases", { invalidate: ["/org/erp"] });
  const invoice = useOnlineMutation<{ id: string; invoiceNumber: string; invoiceDate: string }, unknown>("POST", (b) => `/org/erp/purchases/${b.id}/invoice`);
  const receive = useOnlineMutation<{ id: string; warehouseId: string; date: string }, unknown>("POST", (b) => `/org/erp/purchases/${b.id}/receive`);

  const whs = warehouses.data ?? [];
  // Por defecto entra al depósito predeterminado; "todavía no" deja la compra pendiente de recibir.
  const wh = warehouseId ?? whs.find((w) => w.isDefault)?.id ?? whs[0]?.id ?? "";
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + lineAmount(parseDecimal(l.qty) ?? 0, toMinor(parseDecimal(l.price) ?? 0, currency)), 0);
  const suppliers = (parties.data ?? []).filter((p) => p.kind !== "customer");

  const saveParty = async () => {
    const name = newParty?.name.trim() ?? "";
    if (!name) return setPartyError(t("office.admPartyNeedsName"));
    setPartyError(null);
    const r = await createParty.mutate({ name, ruc: newParty?.ruc.trim() || null, kind: "supplier" });
    if (r.ok) {
      await parties.refresh();
      setPartyId(r.data.id);
      setNewParty(null);
    }
  };

  const submit = async () => {
    if (saving) return;
    const body = [];
    for (const l of lines) {
      const qty = parseDecimal(l.qty);
      const price = parseDecimal(l.price);
      if (qty === null || qty <= 0) return setError(t("office.admBadQty"));
      if (price === null || price < 0) return setError(t("office.admBadPrice"));
      if (!l.productId && !l.description.trim()) return setError(t("office.admNeedsLineProduct"));
      body.push({ productId: l.productId || null, description: l.productId ? null : l.description.trim(), category: l.productId ? null : "other", qty, unitPrice: toMinor(price, currency) });
    }
    if (!date) return setError(t("office.admNeedsDate"));
    setError(null);
    setSaving(true);
    try {
      const r = await create.mutate({ partyId: partyId || null, orderDate: date, currency, lines: body });
      if (!r.ok) return setError(r.error);
      const id = r.data.id;
      const later: string[] = [];
      if (invoiceNumber.trim()) {
        const i = await invoice.mutate({ id, invoiceNumber: invoiceNumber.trim(), invoiceDate: date });
        if (!i.ok) later.push(i.error);
      }
      if (wh && warehouseId !== "") {
        const rc = await receive.mutate({ id, warehouseId: wh, date });
        if (!rc.ok) later.push(rc.error);
      }
      if (photo) {
        try {
          await uploadInvoicePhoto("purchases", id, photo);
        } catch (e) {
          later.push(e instanceof Error ? e.message : t("ui.photoUploadFailed"));
        }
      }
      invalidate(["/org/erp"]);
      if (later.length) {
        // La compra ya está guardada: se avisa lo que faltó y se sigue en su detalle para completarlo.
        showToast(t("office.admSavedPartial"));
        router.replace({ pathname: "/office/admin/purchase", params: { id } } as never);
        return;
      }
      showToast(t("ui.erpSaved"));
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const pending = saving || create.pending;
  return (
    <AdminGate need="manage" title={t("ui.purchNew")}>
      <OfficeScreen title={t("ui.purchNew")} action={{ label: t("ui.save"), onPress: submit, loading: pending, disabled: !!noSignal }}>
        <NoSignalNote />
        <SelectField
          label={t("ui.purchSupplier")}
          value={partyId}
          placeholder="—"
          options={[{ value: "", label: "—" }, ...suppliers.map((p) => ({ value: p.id, label: p.name })), { value: NEW, label: t("office.admNewSupplier") }]}
          onChange={(v) => (v === NEW ? (setPartyError(null), createParty.reset(), setNewParty({ name: "", ruc: "" })) : setPartyId(v))}
        />
        <DateField label={t("ui.costDate")} value={date} onChange={setDate} />
        <View style={{ marginTop: 16 }}>
          <Segmented<Currency> value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
        </View>

        <SectionHeader title={t("office.admLines")} />
        {lines.map((l, i) => {
          const prod = byId.get(l.productId);
          return (
            <View key={i} style={{ borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, padding: 14, paddingTop: 2, marginTop: 12, backgroundColor: C.blanco }}>
              <SelectField label={t("ui.stockProduct")} value={l.productId} options={[{ value: "", label: t("ui.purchExpense") }, ...products.map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => setLine(i, { productId: v })} />
              {!l.productId ? <TextField label={t("ui.purchDescription")} value={l.description} onChangeText={(v) => setLine(i, { description: v })} maxLength={200} /> : null}
              <TextField label={`${t("ui.purchQty")}${prod ? ` (${unitOf(prod)})` : ""}`} value={l.qty} onChangeText={(v) => setLine(i, { qty: v })} kind="decimal" />
              <TextField label={`${t("ui.purchUnitPrice")} (${currency === "PYG" ? "Gs." : "US$"})`} value={l.price} onChangeText={(v) => setLine(i, { price: v })} kind="decimal" />
              {lines.length > 1 ? <Button kind="text" icon={Trash2} title={t("ui.delete")} onPress={() => setLines((ls) => ls.filter((_, n) => n !== i))} style={{ marginTop: 4 }} /> : null}
            </View>
          );
        })}
        <Button kind="secondary" icon={Plus} title={t("ui.purchAddLine")} onPress={() => setLines((ls) => [...ls, blankLine()])} disabled={lines.length >= 20} style={{ marginTop: 12 }} />
        <Text style={[T.heading, { marginTop: 16, textAlign: "right" }]}>{fmtMoney(total, currency)}</Text>

        <SectionHeader title={t("ui.purchReception")} />
        <SelectField
          label={t("ui.stockWarehouse")}
          value={warehouseId === "" ? "" : wh}
          options={[{ value: "", label: t("office.admReceiveLater") }, ...whs.map((w) => ({ value: w.id, label: w.name }))]}
          onChange={(v) => setWarehouseId(v)}
          hint={whs.length === 0 ? t("ui.stockNeedWarehouseBody") : undefined}
        />

        <SectionHeader title={t("ui.purchInvoice")} />
        <TextField label={t("ui.purchInvoiceNumber")} value={invoiceNumber} onChangeText={setInvoiceNumber} maxLength={40} autoCapitalize="none" />
        <View style={{ marginTop: 16, gap: 12 }}>
          {photo ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Image accessibilityLabel={t("ui.purchInvoice")} source={{ uri: photo.uri }} style={{ width: 88, height: 88, borderRadius: RADIUS, backgroundColor: C.linea }} />
              <View style={{ flex: 1, gap: 4 }}>
                <InvoicePhotoButton title={HAS_CAMERA ? t("office.admRetakePhoto") : t("office.admChangePhoto")} onPick={setPhoto} />
                <Button kind="text" title={t("ui.photoRemove")} onPress={() => setPhoto(null)} />
              </View>
            </View>
          ) : (
            <InvoicePhotoButton title={HAS_CAMERA ? t("office.admTakeInvoicePhoto") : t("ui.photoAttach")} onPick={setPhoto} />
          )}
          {!HAS_CAMERA ? <Text style={T.small}>{t("office.admNoCameraWeb")}</Text> : null}
        </View>
        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[T.bodyMedium, { color: C.peligro, marginTop: 16 }]}>
            {error}
          </Text>
        ) : null}

        <FormSheet visible={!!newParty} title={t("office.admNewSupplier")} onClose={() => setNewParty(null)} onSubmit={saveParty} submitLabel={t("ui.save")} pending={createParty.pending} error={partyError ?? createParty.error}>
          <TextField label={t("ui.partyName")} value={newParty?.name ?? ""} onChangeText={(v) => setNewParty((p) => (p ? { ...p, name: v } : p))} maxLength={120} />
          <TextField label={t("ui.partyRuc")} hint={t("ui.partyRucHint")} value={newParty?.ruc ?? ""} onChangeText={(v) => setNewParty((p) => (p ? { ...p, ruc: v } : p))} maxLength={12} autoCapitalize="none" />
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
