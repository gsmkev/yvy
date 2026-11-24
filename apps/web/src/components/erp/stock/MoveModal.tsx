import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, localDate, toMinor, type Currency } from "@yvy/shared";
import { post } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { useFarm, useFarms } from "../../../lib/queries";
import { useProducts } from "../../../lib/products";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import { useParties } from "../PartiesPanel";
import { useWarehouses } from "../WarehousesPanel";
import type { Mode } from "./types";

export function MoveModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const qc = useQueryClient();
  const products = useProducts();
  const warehouses = useWarehouses();
  const parties = useParties();
  const farms = useFarms();
  const [f, setF] = useState({
    productId: "",
    warehouseId: "",
    toWarehouseId: "",
    date: localDate(Date.now()),
    qty: "",
    amount: "",
    currency: "PYG",
    partyId: "",
    farmId: "",
    plotId: "",
    note: "",
    sign: "1",
    lot: "",
    expiresOn: "",
  });
  const farm = useFarm(f.farmId, mode === "consumption" && !!f.farmId);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value, ...(k === "farmId" ? { plotId: "" } : {}) });
  const save = useMutation({
    mutationFn: () => {
      const common = { productId: f.productId, date: f.date, note: f.note.trim() || null };
      const qty = Number(f.qty);
      if (mode === "purchase")
        return post("/org/erp/stock/purchases", {
          ...common,
          warehouseId: f.warehouseId,
          qty,
          amount: toMinor(Number(f.amount), f.currency as Currency),
          currency: f.currency,
          partyId: f.partyId || null,
          lot: f.lot.trim() || null,
          expiresOn: f.expiresOn || null,
        });
      if (mode === "consumption")
        return post("/org/erp/stock/consumptions", { ...common, warehouseId: f.warehouseId, qty, plotId: f.plotId || null });
      if (mode === "transfer")
        return post("/org/erp/stock/transfers", { ...common, fromWarehouseId: f.warehouseId, toWarehouseId: f.toWarehouseId, qty });
      return post("/org/erp/stock/adjustments", { ...common, warehouseId: f.warehouseId, qty: qty * Number(f.sign) });
    },
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const whOptions = (warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }));
  const pick = { value: "", label: t("ui.stockPick") };
  return (
    <Modal title={t(`ui.stockMode_${mode}`)} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
        <div className="col-span-2">
          <Field label={t("ui.stockProduct")}>
            <Select required value={f.productId} onChange={set("productId")} options={[pick, ...(products.data ?? []).map((p) => ({ value: p.id, label: `${p.name} (${tk(`fields.productUnit_${p.unit}`)})` }))]} />
          </Field>
        </div>
        <Field label={mode === "transfer" ? t("ui.stockFrom") : t("ui.stockWarehouse")}>
          <Select required value={f.warehouseId} onChange={set("warehouseId")} options={[pick, ...whOptions]} />
        </Field>
        {mode === "transfer" ? (
          <Field label={t("ui.stockTo")}>
            <Select required value={f.toWarehouseId} onChange={set("toWarehouseId")} options={[pick, ...whOptions]} />
          </Field>
        ) : (
          <Field label={t("ui.costDate")}>
            <Input type="date" required value={f.date} onChange={set("date")} />
          </Field>
        )}
        {mode === "transfer" && (
          <Field label={t("ui.costDate")}>
            <Input type="date" required value={f.date} onChange={set("date")} />
          </Field>
        )}
        {mode === "adjustment" && (
          <Field label={t("ui.stockAdjustSign")}>
            <Select value={f.sign} onChange={set("sign")} options={[{ value: "1", label: t("ui.stockAdjustPlus") }, { value: "-1", label: t("ui.stockAdjustMinus") }]} />
          </Field>
        )}
        <Field label={t("ui.stockQty")}>
          <Input type="number" required min={0} step="any" value={f.qty} onChange={set("qty")} />
        </Field>
        {mode === "purchase" && (
          <>
            <Field label={t("ui.currency")}>
              <Select value={f.currency} onChange={set("currency")} options={CURRENCIES.map((x) => ({ value: x, label: x }))} />
            </Field>
            <Field label={t("ui.stockTotalAmount")}>
              <Input type="number" required min={0} step="any" value={f.amount} onChange={set("amount")} />
            </Field>
            <Field label={t("ui.stockLot")}>
              <Input value={f.lot} onChange={set("lot")} maxLength={40} />
            </Field>
            <Field label={t("ui.stockExpires")}>
              <Input type="date" value={f.expiresOn} onChange={set("expiresOn")} />
            </Field>
            <div className="col-span-2">
              <Field label={t("ui.stockSupplier")}>
                <Select value={f.partyId} onChange={set("partyId")} options={[{ value: "", label: t("ui.costNone") }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
              </Field>
            </div>
          </>
        )}
        {mode === "consumption" && (
          <>
            <Field label={t("ui.costFarm")}>
              <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.costNone") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
            </Field>
            <Field label={t("ui.stockChargePlot")}>
              <Select value={f.plotId} onChange={set("plotId")} disabled={!f.farmId} options={[{ value: "", label: t("ui.costNone") }, ...(farm.data?.plots ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
            </Field>
          </>
        )}
        <div className="col-span-2">
          <Field label={t("ui.stockNote")}>
            <Input value={f.note} onChange={set("note")} maxLength={200} />
          </Field>
        </div>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
