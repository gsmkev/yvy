/** Diálogo para cargar un movimiento de stock. */
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

/**
 * Alta de un movimiento.
 * @param mode tipo de movimiento.
 */
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
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const whOptions = (warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }));
  const pick = { value: "", label: t("ui.stock.pick") };
  return (
    <Modal title={t(`ui.stock.mode_${mode}`)} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
        <div className="col-span-2">
          <Field label={t("ui.stock.product")}>
            <Select required value={f.productId} onChange={set("productId")} options={[pick, ...(products.data ?? []).map((p) => ({ value: p.id, label: `${p.name} (${tk(`fields.product.unit_${p.unit}`)})` }))]} />
          </Field>
        </div>
        <Field label={mode === "transfer" ? t("ui.stock.from") : t("ui.stock.warehouse")}>
          <Select required value={f.warehouseId} onChange={set("warehouseId")} options={[pick, ...whOptions]} />
        </Field>
        {mode === "transfer" ? (
          <Field label={t("ui.stock.to")}>
            <Select required value={f.toWarehouseId} onChange={set("toWarehouseId")} options={[pick, ...whOptions]} />
          </Field>
        ) : (
          <Field label={t("ui.cost.date")}>
            <Input type="date" required value={f.date} onChange={set("date")} />
          </Field>
        )}
        {mode === "transfer" && (
          <Field label={t("ui.cost.date")}>
            <Input type="date" required value={f.date} onChange={set("date")} />
          </Field>
        )}
        {mode === "adjustment" && (
          <Field label={t("ui.stock.adjustSign")}>
            <Select value={f.sign} onChange={set("sign")} options={[{ value: "1", label: t("ui.stock.adjustPlus") }, { value: "-1", label: t("ui.stock.adjustMinus") }]} />
          </Field>
        )}
        <Field label={t("ui.stock.qty")}>
          <Input type="number" required min={0} step="any" value={f.qty} onChange={set("qty")} />
        </Field>
        {mode === "purchase" && (
          <>
            <Field label={t("ui.common.currency")}>
              <Select value={f.currency} onChange={set("currency")} options={CURRENCIES.map((x) => ({ value: x, label: x }))} />
            </Field>
            <Field label={t("ui.stock.totalAmount")}>
              <Input type="number" required min={0} step="any" value={f.amount} onChange={set("amount")} />
            </Field>
            <Field label={t("ui.stock.lot")}>
              <Input value={f.lot} onChange={set("lot")} maxLength={40} />
            </Field>
            <Field label={t("ui.stock.expires")}>
              <Input type="date" value={f.expiresOn} onChange={set("expiresOn")} />
            </Field>
            <div className="col-span-2">
              <Field label={t("ui.stock.supplier")}>
                <Select value={f.partyId} onChange={set("partyId")} options={[{ value: "", label: t("ui.cost.none") }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
              </Field>
            </div>
          </>
        )}
        {mode === "consumption" && (
          <>
            <Field label={t("ui.cost.farm")}>
              <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.cost.none") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
            </Field>
            <Field label={t("ui.stock.chargePlot")}>
              <Select value={f.plotId} onChange={set("plotId")} disabled={!f.farmId} options={[{ value: "", label: t("ui.cost.none") }, ...(farm.data?.plots ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
            </Field>
          </>
        )}
        <div className="col-span-2">
          <Field label={t("ui.stock.note")}>
            <Input value={f.note} onChange={set("note")} maxLength={200} />
          </Field>
        </div>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
