/** Piezas del formulario de compra nueva: renglones, bloque de la factura y alta rápida de proveedor. */
import { useState } from "react";
import { Image, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { t, type Currency } from "@yvy/shared";
import type { Product } from "../../db/store";
import { Button, SectionHeader, Text } from "../../ui/kit";
import { C, RADIUS, T } from "../../ui/theme";
import { unitOf } from "../adminKit";
import { HAS_CAMERA, InvoicePhotoButton, type PickedPhoto } from "../invoicePhoto";
import { fmtMoney } from "../money";
import { FormSheet, SelectField, TextField } from "../ui";
import { useOnlineMutation } from "../useOnlineMutation";
import { blankLine, linesTotal, type LineDraft } from "./lines";

const MAX_LINES = 20;
/** Valor de la lista de proveedores que abre el alta de uno nuevo. */
export const NEW_SUPPLIER = "__new__";

interface LinesProps {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  currency: Currency;
  products: Product[];
  byId: Map<string, Product>;
}

/** Renglones de la compra (producto o gasto, cantidad y precio) con el total al pie. */
export function PurchaseLines({ lines, onChange, currency, products, byId }: LinesProps) {
  const setLine = (i: number, patch: Partial<LineDraft>) => onChange(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  return (
    <>
      <SectionHeader title={t("office.adm.lines")} />
      {lines.map((l, i) => {
        const prod = byId.get(l.productId);
        return (
          <View key={i} style={{ borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, padding: 14, paddingTop: 2, marginTop: 12, backgroundColor: C.blanco }}>
            <SelectField label={t("ui.stock.product")} value={l.productId} options={[{ value: "", label: t("ui.purch.expense") }, ...products.map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => setLine(i, { productId: v })} />
            {!l.productId ? <TextField label={t("ui.purch.description")} value={l.description} onChangeText={(v) => setLine(i, { description: v })} maxLength={200} /> : null}
            <TextField label={`${t("ui.purch.qty")}${prod ? ` (${unitOf(prod)})` : ""}`} value={l.qty} onChangeText={(v) => setLine(i, { qty: v })} kind="decimal" />
            <TextField label={`${t("ui.purch.unitPrice")} (${currency === "PYG" ? "Gs." : "US$"})`} value={l.price} onChangeText={(v) => setLine(i, { price: v })} kind="decimal" />
            {lines.length > 1 ? <Button kind="text" icon={Trash2} title={t("ui.common.delete")} onPress={() => onChange(lines.filter((_, n) => n !== i))} style={{ marginTop: 4 }} /> : null}
          </View>
        );
      })}
      <Button kind="secondary" icon={Plus} title={t("ui.purch.addLine")} onPress={() => onChange([...lines, blankLine()])} disabled={lines.length >= MAX_LINES} style={{ marginTop: 12 }} />
      <Text style={[T.heading, { marginTop: 16, textAlign: "right" }]}>{fmtMoney(linesTotal(lines, currency), currency)}</Text>
    </>
  );
}

/** Número de factura y foto (con cámara en el celular, archivo en la web). */
export function InvoiceBlock({ number, onNumber, photo, onPhoto }: { number: string; onNumber: (v: string) => void; photo: PickedPhoto | null; onPhoto: (p: PickedPhoto | null) => void }) {
  return (
    <>
      <SectionHeader title={t("ui.purch.invoice")} />
      <TextField label={t("ui.purch.invoiceNumber")} value={number} onChangeText={onNumber} maxLength={40} autoCapitalize="none" />
      <View style={{ marginTop: 16, gap: 12 }}>
        {photo ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image accessibilityLabel={t("ui.purch.invoice")} source={{ uri: photo.uri }} style={{ width: 88, height: 88, borderRadius: RADIUS, backgroundColor: C.linea }} />
            <View style={{ flex: 1, gap: 4 }}>
              <InvoicePhotoButton title={HAS_CAMERA ? t("office.adm.retakePhoto") : t("office.adm.changePhoto")} onPick={onPhoto} />
              <Button kind="text" title={t("ui.photo.remove")} onPress={() => onPhoto(null)} />
            </View>
          </View>
        ) : (
          <InvoicePhotoButton title={HAS_CAMERA ? t("office.adm.takeInvoicePhoto") : t("ui.photo.attach")} onPick={onPhoto} />
        )}
        {!HAS_CAMERA ? <Text style={T.small}>{t("office.adm.noCameraWeb")}</Text> : null}
      </View>
    </>
  );
}

/** Alta rápida de proveedor desde la compra; se monta al abrirla (nace vacía) y al guardar avisa el id creado. */
export function NewSupplierSheet({ onClose, onCreated, refreshParties }: { onClose: () => void; onCreated: (id: string) => void; refreshParties: () => Promise<void> }) {
  const [value, setValue] = useState({ name: "", ruc: "" });
  const [error, setError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/parties", { invalidate: ["/org/erp"] });
  const save = async () => {
    const name = value.name.trim();
    if (!name) return setError(t("office.adm.partyNeedsName"));
    setError(null);
    const r = await create.mutate({ name, ruc: value.ruc.trim() || null, kind: "supplier" });
    if (!r.ok) return;
    await refreshParties();
    onCreated(r.data.id);
  };
  return (
    <FormSheet visible title={t("office.adm.newSupplier")} onClose={onClose} onSubmit={save} submitLabel={t("ui.common.save")} pending={create.pending} error={error ?? create.error}>
      <TextField label={t("ui.party.name")} value={value.name} onChangeText={(v) => setValue((p) => ({ ...p, name: v }))} maxLength={120} />
      <TextField label={t("ui.party.ruc")} hint={t("ui.party.rucHint")} value={value.ruc} onChangeText={(v) => setValue((p) => ({ ...p, ruc: v }))} maxLength={12} autoCapitalize="none" />
    </FormSheet>
  );
}
