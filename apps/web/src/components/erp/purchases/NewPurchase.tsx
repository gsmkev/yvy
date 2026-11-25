/** Diálogo para cargar una compra: proveedor, estancia, fecha y renglones de productos o gastos. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { COST_CATEGORIES, CURRENCIES, lineAmount, localDate, toMinor, type Currency } from "@yvy/shared";
import { post } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { fmtMoney } from "../../../lib/money";
import { useFarms } from "../../../lib/queries";
import { useProducts } from "../../../lib/products";
import type { Product } from "../../../lib/types";
import { Button, Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import { useParties } from "../PartiesPanel";

interface LineForm {
  productId: string;
  description: string;
  category: string;
  qty: string;
  unitPrice: string;
}

const blankLine = (productId: string): LineForm => ({ productId, description: "", category: "other", qty: "1", unitPrice: "" });

/** Un renglón: producto (o gasto) con cantidad y precio; el gasto suma descripción y categoría. */
function LineRow({ l, products, canRemove, onChange, onRemove }: { l: LineForm; products: Product[]; canRemove: boolean; onChange: (p: Partial<LineForm>) => void; onRemove: () => void }) {
  return (
    <div className="grid grid-cols-6 items-end gap-2 border-b border-linea pb-2">
      <div className="col-span-3">
        <Select value={l.productId} onChange={(e) => onChange({ productId: e.target.value })} options={[{ value: "", label: t("ui.purch.expense") }, ...products.map((p) => ({ value: p.id, label: p.name }))]} />
      </div>
      <Input type="number" required min={0} step="any" aria-label={t("ui.purch.qty")} placeholder={t("ui.purch.qty")} value={l.qty} onChange={(e) => onChange({ qty: e.target.value })} />
      <Input type="number" required min={0} step="any" aria-label={t("ui.purch.unitPrice")} placeholder={t("ui.purch.unitPrice")} value={l.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} />
      <button type="button" className="cursor-pointer text-tinta-2 hover:text-peligro" disabled={!canRemove} onClick={onRemove}>
        {t("ui.common.delete")}
      </button>
      {!l.productId && (
        <>
          <div className="col-span-3">
            <Input required maxLength={200} placeholder={t("ui.purch.description")} value={l.description} onChange={(e) => onChange({ description: e.target.value })} />
          </div>
          <div className="col-span-3">
            <Select value={l.category} onChange={(e) => onChange({ category: e.target.value })} options={COST_CATEGORIES.filter((c) => c !== "sale").map((c) => ({ value: c, label: tk(`ui.cost.category_${c}`) }))} />
          </div>
        </>
      )}
    </div>
  );
}

function purchaseBody(f: { partyId: string; farmId: string; orderDate: string; currency: Currency }, lines: LineForm[]) {
  return {
    partyId: f.partyId || null,
    farmId: f.farmId || null,
    orderDate: f.orderDate,
    currency: f.currency,
    lines: lines.map((l) => ({
      productId: l.productId || null,
      description: l.productId ? null : l.description || null,
      category: l.productId ? null : l.category,
      qty: Number(l.qty),
      unitPrice: toMinor(Number(l.unitPrice), f.currency),
    })),
  };
}

/** Alta de una compra. */
export function NewPurchase({ onClose }: { onClose: () => void }) {
  const products = useProducts();
  const parties = useParties();
  const farms = useFarms();
  const qc = useQueryClient();
  const [f, setF] = useState({ partyId: "", farmId: "", orderDate: localDate(Date.now()), currency: "PYG" as Currency });
  const [lines, setLines] = useState<LineForm[]>([blankLine(products.data?.[0]?.id ?? "")]);
  const setLine = (i: number, patch: Partial<LineForm>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const save = useMutation({
    mutationFn: () => post("/org/erp/purchases", purchaseBody(f, lines)),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const total = lines.reduce((a, l) => a + lineAmount(Number(l.qty) || 0, toMinor(Number(l.unitPrice) || 0, f.currency)), 0);
  const blank = { value: "", label: "—" };
  return (
    <Modal title={t("ui.purch.new")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.purch.supplier")}>
          <Select value={f.partyId} onChange={(e) => setF({ ...f, partyId: e.target.value })} options={[blank, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label={t("ui.cost.farm")}>
          <Select value={f.farmId} onChange={(e) => setF({ ...f, farmId: e.target.value })} options={[blank, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.cost.date")}>
          <Input required type="date" value={f.orderDate} onChange={(e) => setF({ ...f, orderDate: e.target.value })} />
        </Field>
        <Field label={t("ui.common.currency")}>
          <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2">
          {lines.map((l, i) => (
            <LineRow key={i} l={l} products={products.data ?? []} canRemove={lines.length > 1} onChange={(p) => setLine(i, p)} onRemove={() => setLines(lines.filter((_, k) => k !== i))} />
          ))}
          <div>
            <Button type="button" variant="secondary" disabled={lines.length >= 20} onClick={() => setLines([...lines, blankLine(products.data?.[0]?.id ?? "")])}>
              {t("ui.purch.addLine")}
            </Button>
          </div>
        </div>
        <div className="num text-right font-medium sm:col-span-2">{fmtMoney(total, f.currency)}</div>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
