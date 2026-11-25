/** Piezas de la pantalla de Stock: listas de existencias, movimientos y vencimientos, ajuste por recuento y accesos. */
import { useState } from "react";
import { router, type Href } from "expo-router";
import { ClipboardCheck, Package, PackageMinus } from "lucide-react-native";
import { t } from "@yvy/shared";
import type { Product } from "../../db/store";
import { Row, SectionHeader, Text } from "../../ui/kit";
import { T } from "../../ui/theme";
import { k, today, unitOf, type WarehouseRow } from "../adminKit";
import { isoShort } from "../erpCommon";
import { fmtGs, fmtQty } from "../money";
import { useOnlineMutation } from "../useOnlineMutation";
import { DataList, DateField, FormSheet, Segmented, SelectField, TextField } from "../ui";
import { showToast } from "../../lib/toast";
import { adjustmentQty, type Draft, type Lot, type Move, type StockRow } from "./model";

const go = (href: string) => router.push(href as Href);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface Names {
  byId: Map<string, Product>;
  whName: (id: string) => string;
}

/** Existencias por producto; con varios depósitos, la ficha de la fila los detalla. */
export function StockList({ rows, byId, whName }: Names & { rows: StockRow[] }) {
  const nameOf = (id: string) => byId.get(id)?.name ?? "—";
  return (
    <DataList
      rows={rows}
      keyOf={(r) => r.productId}
      title={(r) => nameOf(r.productId)}
      subtitle={(r) => (r.parts.length > 1 ? t("ui.stock.inWarehouses", { n: r.parts.length }) : r.valuePyg !== undefined ? fmtGs(r.valuePyg) : r.parts[0] ? whName(r.parts[0].warehouseId) : undefined)}
      detail={(r) => {
        const unit = unitOf(byId.get(r.productId));
        return [
          ...r.parts.map((p) => ({ label: whName(p.warehouseId), value: fmtQty(p.qty, unit) })),
          ...(r.parts.length > 1 ? [{ label: t("ui.stock.tabStock"), value: fmtQty(r.qty, unit) }] : []),
          ...(r.valuePyg !== undefined ? [{ label: t("ui.stock.value"), value: fmtGs(r.valuePyg) }] : []),
        ];
      }}
      right={(r) => fmtQty(r.qty, unitOf(byId.get(r.productId)))}
      empty={{ title: t("ui.empty.stockTitle"), hint: t("ui.empty.stockBody") }}
    />
  );
}

/** Movimientos recientes. */
export function MovesList({ rows, byId, whName }: Names & { rows: Move[] }) {
  return (
    <DataList
      rows={rows}
      keyOf={(m) => m.id}
      title={(m) => byId.get(m.productId)?.name ?? "—"}
      subtitle={(m) => `${t(k(`ui.stock.origin_${m.origin}`))}, ${isoShort(dayOf(m.occurredAt))}`}
      detail={(m) => [
        { label: t("ui.stock.warehouse"), value: whName(m.warehouseId) },
        { label: t("ui.stock.qty"), value: `${m.qty > 0 ? "+" : ""}${fmtQty(m.qty, unitOf(byId.get(m.productId)))}` },
        ...(m.note ? [{ label: t("ui.stock.note"), value: m.note }] : []),
      ]}
      right={(m) => `${m.qty > 0 ? "+" : ""}${fmtQty(m.qty, unitOf(byId.get(m.productId)))}`}
      empty={{ title: t("ui.erp.empty"), hint: t("ui.empty.movesBody") }}
    />
  );
}

/** Lotes por vencer. */
export function LotsList({ rows, byId }: { rows: Lot[]; byId: Map<string, Product> }) {
  return (
    <DataList
      rows={rows}
      keyOf={(l) => `${l.productId}-${l.lot}-${l.expiresOn}`}
      title={(l) => byId.get(l.productId)?.name ?? "—"}
      subtitle={(l) => `${fmtQty(l.remaining, unitOf(byId.get(l.productId)))}, ${isoShort(l.expiresOn)}`}
      detail={(l) => [...(l.lot ? [{ label: t("ui.expiring.lot", { lot: l.lot }), value: fmtQty(l.remaining, unitOf(byId.get(l.productId))) }] : []), { label: t("ui.expiring.title"), value: isoShort(l.expiresOn) }]}
      right={(l) => (l.daysLeft < 0 ? t("ui.expiring.expired", { n: -l.daysLeft }) : t("ui.expiring.in", { n: l.daysLeft }))}
      empty={{ title: t("ui.erp.empty") }}
    />
  );
}

/** Accesos a recuento, mínimos y productos. */
export function StockLinks() {
  return (
    <>
      <SectionHeader title={t("office.adm.stockMore")} />
      <Row icon={ClipboardCheck} title={t("ui.count.title")} subtitle={t("office.adm.countHint")} onPress={() => go("/stock-count")} />
      <Row icon={PackageMinus} title={t("ui.admin.section_minstock")} subtitle={t("office.adm.minStockHint")} onPress={() => go("/office/admin/min-stock")} />
      <Row icon={Package} title={t("ui.admin.section_products")} subtitle={t("office.adm.productsHint")} onPress={() => go("/office/products")} />
    </>
  );
}

function SignToggle({ value, onChange }: { value: "plus" | "minus"; onChange: (v: "plus" | "minus") => void }) {
  return (
    <>
      <Text style={[T.smallMedium, { marginTop: 16, marginBottom: 6 }]}>{t("ui.stock.adjustSign")}</Text>
      <Segmented<"plus" | "minus"> value={value} onChange={onChange} options={[{ value: "plus", label: t("ui.stock.adjustPlus") }, { value: "minus", label: t("ui.stock.adjustMinus") }]} />
    </>
  );
}

/** Estado del ajuste por recuento: borrador abierto, guardado y errores. */
export function useAdjustEditor(defaultWarehouse: string) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const adjust = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/stock/adjustments", { invalidate: ["/org/erp"] });
  const open = () => {
    setFormError(null);
    adjust.reset();
    setDraft({ productId: "", warehouseId: defaultWarehouse, sign: "plus", qty: "", date: today(), note: "" });
  };
  const submit = async () => {
    if (!draft) return;
    const a = adjustmentQty(draft);
    if ("error" in a) return setFormError(a.error);
    setFormError(null);
    const r = await adjust.mutate({ productId: draft.productId, warehouseId: draft.warehouseId, date: draft.date, qty: a.qty, note: draft.note.trim() || null });
    if (!r.ok) return;
    setDraft(null);
    showToast(t("ui.erp.saved"));
  };
  return { draft, open, submit, close: () => setDraft(null), set: (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), pending: adjust.pending, error: formError ?? adjust.error };
}

/** Formulario del ajuste de stock por recuento. */
export function AdjustSheet({ editor, products, warehouses, byId }: { editor: ReturnType<typeof useAdjustEditor>; products: Product[]; warehouses: WarehouseRow[]; byId: Map<string, Product> }) {
  const { draft, set } = editor;
  const unit = unitOf(byId.get(draft?.productId ?? ""));
  return (
    <FormSheet visible={!!draft} title={t("ui.stock.mode_adjustment")} onClose={editor.close} onSubmit={editor.submit} submitLabel={t("ui.common.save")} pending={editor.pending} error={editor.error}>
      <SelectField label={t("ui.stock.product")} value={draft?.productId} placeholder={t("ui.stock.pick")} options={products.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => set({ productId: v })} />
      <SelectField label={t("ui.stock.warehouse")} value={draft?.warehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} onChange={(v) => set({ warehouseId: v })} />
      <SignToggle value={draft?.sign ?? "plus"} onChange={(v) => set({ sign: v })} />
      <TextField label={`${t("ui.stock.qty")}${unit ? ` (${unit})` : ""}`} value={draft?.qty ?? ""} onChangeText={(v) => set({ qty: v })} kind="decimal" />
      <DateField label={t("ui.cost.date")} value={draft?.date ?? ""} onChange={(v) => set({ date: v })} />
      <TextField label={t("ui.stock.note")} value={draft?.note ?? ""} onChangeText={(v) => set({ note: v })} maxLength={200} />
    </FormSheet>
  );
}
