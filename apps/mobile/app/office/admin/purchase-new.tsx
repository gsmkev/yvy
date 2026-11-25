/**
 * Alta rápida de una compra en el campo: proveedor (lista o nuevo), fecha, líneas, depósito de
 * recepción y foto de la factura con la cámara. POST /org/erp/purchases y, según lo cargado, .../invoice, .../receive
 * y la foto (URL firmada de /org/erp/photos/purchases/:id). Nada se guarda en el celular.
 */
import { useState } from "react";
import { View } from "react-native";
import { t, type Currency } from "@yvy/shared";
import { AdminGate, CURRENCY_OPTIONS, today, useParties, useProductMap, useWarehouses } from "../../../src/office/adminKit";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import type { PickedPhoto } from "../../../src/office/invoicePhoto";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { blankLine, type LineDraft } from "../../../src/office/purchases/lines";
import { InvoiceBlock, NEW_SUPPLIER, NewSupplierSheet, PurchaseLines } from "../../../src/office/purchases/PurchaseParts";
import { usePurchaseSubmit } from "../../../src/office/purchases/usePurchaseSubmit";
import { DateField, Segmented, SelectField } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

/** Alta de una compra con sus renglones y, si hace falta, la foto de la factura. */
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
  const [addingSupplier, setAddingSupplier] = useState(false);
  const { submit, error, pending } = usePurchaseSubmit();

  const whs = warehouses.data ?? [];
  // Por defecto entra al depósito predeterminado; "todavía no" deja la compra pendiente de recibir.
  const wh = warehouseId ?? whs.find((w) => w.isDefault)?.id ?? whs[0]?.id ?? "";
  const suppliers = (parties.data ?? []).filter((p) => p.kind !== "customer");

  return (
    <AdminGate need="manage" title={t("ui.purch.new")}>
      <OfficeScreen title={t("ui.purch.new")} action={{ label: t("ui.common.save"), onPress: () => void submit({ partyId, date, currency, lines, invoiceNumber, photo }, warehouseId === "" ? "" : wh), loading: pending, disabled: !!noSignal }}>
        <NoSignalNote />
        <SelectField
          label={t("ui.purch.supplier")}
          value={partyId}
          placeholder="—"
          options={[{ value: "", label: "—" }, ...suppliers.map((p) => ({ value: p.id, label: p.name })), { value: NEW_SUPPLIER, label: t("office.adm.newSupplier") }]}
          onChange={(v) => (v === NEW_SUPPLIER ? setAddingSupplier(true) : setPartyId(v))}
        />
        <DateField label={t("ui.cost.date")} value={date} onChange={setDate} />
        <View style={{ marginTop: 16 }}>
          <Segmented<Currency> value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
        </View>
        <PurchaseLines lines={lines} onChange={setLines} currency={currency} products={products} byId={byId} />

        <SectionHeader title={t("ui.purch.reception")} />
        <SelectField
          label={t("ui.stock.warehouse")}
          value={warehouseId === "" ? "" : wh}
          options={[{ value: "", label: t("office.adm.receiveLater") }, ...whs.map((w) => ({ value: w.id, label: w.name }))]}
          onChange={(v) => setWarehouseId(v)}
          hint={whs.length === 0 ? t("ui.stock.needWarehouseBody") : undefined}
        />
        <InvoiceBlock number={invoiceNumber} onNumber={setInvoiceNumber} photo={photo} onPhoto={setPhoto} />
        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[T.bodyMedium, { color: C.peligro, marginTop: 16 }]}>
            {error}
          </Text>
        ) : null}
        {addingSupplier ? (
          <NewSupplierSheet
            onClose={() => setAddingSupplier(false)}
            refreshParties={async () => {
              await parties.refresh();
            }}
            onCreated={(id) => {
              setPartyId(id);
              setAddingSupplier(false);
            }}
          />
        ) : null}
      </OfficeScreen>
    </AdminGate>
  );
}
