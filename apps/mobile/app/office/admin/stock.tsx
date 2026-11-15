/**
 * Stock (función 120): existencias por depósito y producto, movimientos recientes, vencimientos y ajuste por recuento
 * (dueño y administrador). El agrónomo ve cantidades: la API no le manda montos y esta pantalla tampoco los pide.
 * /org/erp/stock, /stock/moves, /stock/expiring y POST /stock/adjustments.
 */
import { useMemo, useState } from "react";
import { router, type Href } from "expo-router";
import { ClipboardCheck, Package, PackageMinus, Plus } from "lucide-react-native";
import { t } from "@yvy/shared";
import { showToast } from "../../../src/lib/toast";
import { AdminGate, compactMoney, k, today, unitOf, useAdminAccess, useProductMap, useWarehouses } from "../../../src/office/adminKit";
import { isoShort, NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { parseDecimal } from "../../../src/office/format";
import { fmtGs, fmtQty } from "../../../src/office/money";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DataList, DateField, FilterChips, FormSheet, Segmented, SelectField, StatRow, TextField } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { EmptyState, Row, SectionHeader, Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

interface Summary {
  rows: { productId: string; warehouseId: string; qty: number; valuePyg?: number }[];
  products: { productId: string; qty: number; valuePyg?: number; avgCostPyg?: number }[];
}
interface Move {
  id: string;
  productId: string;
  warehouseId: string;
  qty: number;
  occurredAt: number;
  origin: "purchase" | "consumption" | "transfer" | "adjustment";
  note: string | null;
}
interface Lot {
  productId: string;
  lot: string | null;
  expiresOn: string;
  daysLeft: number;
  remaining: number;
}

type Tab = "stock" | "moves" | "expiring";
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const go = (href: string) => router.push(href as Href);

interface Draft {
  productId: string;
  warehouseId: string;
  sign: "plus" | "minus";
  qty: string;
  date: string;
  note: string;
}

export default function Stock() {
  const { manage } = useAdminAccess();
  const stock = useOnline<Summary>("/org/erp/stock");
  const moves = useOnline<Move[]>("/org/erp/stock/moves");
  const lots = useOnline<Lot[]>("/org/erp/stock/expiring");
  const wh = useWarehouses();
  const { products, byId } = useProductMap();
  const [tab, setTab] = useState<Tab>("stock");
  const [warehouseId, setWarehouseId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const adjust = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/stock/adjustments", { invalidate: ["/org/erp"] });
  const noSignal = useNoSignalReason();
  const whName = (id: string) => wh.data?.find((w) => w.id === id)?.name ?? "";
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const warehouses = wh.data ?? [];
  const lotRows = lots.data ?? [];
  const showValue = (stock.data?.products ?? []).some((p) => p.valuePyg !== undefined);

  const stockRows = useMemo(() => {
    const s = stock.data;
    if (!s) return [];
    if (!warehouseId) return s.products.filter((p) => Math.abs(p.qty) > 1e-9).map((p) => ({ productId: p.productId, qty: p.qty, valuePyg: p.valuePyg, where: s.rows.filter((r) => r.productId === p.productId && Math.abs(r.qty) > 1e-9).map((r) => `${whName(r.warehouseId)}: ${fmtQty(r.qty)}`).join(" · ") }));
    return s.rows.filter((r) => r.warehouseId === warehouseId && Math.abs(r.qty) > 1e-9).map((r) => ({ productId: r.productId, qty: r.qty, valuePyg: r.valuePyg, where: "" }));
  }, [stock.data, warehouseId, wh.data]);
  const sortedRows = [...stockRows].sort((a, b) => (byId.get(a.productId)?.name ?? "").localeCompare(byId.get(b.productId)?.name ?? ""));
  const moveRows = (moves.data ?? []).filter((m) => !warehouseId || m.warehouseId === warehouseId);
  const totalValue = stockRows.reduce((a, r) => a + (r.valuePyg ?? 0), 0);

  const openAdjust = () => {
    setFormError(null);
    adjust.reset();
    setDraft({ productId: "", warehouseId: warehouseId || warehouses[0]?.id || "", sign: "plus", qty: "", date: today(), note: "" });
  };
  const submit = async () => {
    if (!draft) return;
    if (!draft.productId) return setFormError(t("office.admNeedsProduct"));
    if (!draft.warehouseId) return setFormError(t("ui.stockNoWarehouse"));
    const n = parseDecimal(draft.qty);
    if (n === null || n <= 0) return setFormError(t("office.admBadQty"));
    if (!draft.date) return setFormError(t("office.admNeedsDate"));
    setFormError(null);
    const r = await adjust.mutate({ productId: draft.productId, warehouseId: draft.warehouseId, date: draft.date, qty: draft.sign === "plus" ? n : -n, note: draft.note.trim() || null });
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erpSaved"));
    }
  };

  const needSetup = !wh.loading && warehouses.length === 0 && wh.data !== null;
  const err = formError ?? adjust.error;
  const q = stock;
  return (
    <AdminGate need="stock" title={t("ui.adminSection_stock")}>
      <OfficeScreen
        title={t("ui.adminSection_stock")}
        query={q}
        onRefresh={async () => {
          await Promise.all([stock.refresh(), moves.refresh(), lots.refresh(), wh.refresh()]);
        }}
        action={manage && !needSetup ? { label: t("ui.stockMode_adjustment"), icon: Plus, onPress: openAdjust, disabled: !!noSignal } : undefined}
      >
        {manage ? <NoSignalNote /> : null}
        {needSetup ? (
          <EmptyState title={t("ui.stockNeedWarehouseTitle")} hint={t("ui.stockNeedWarehouseBody")} action={manage ? t("ui.warehouseLoad") : undefined} onAction={() => go("/office/admin/warehouses")} />
        ) : (
          <OnlineState query={stock} empty={{ title: t("ui.emptyStockTitle"), hint: t("ui.emptyStockBody") }} isEmpty={(d) => d.rows.length === 0 && d.products.length === 0}>
            {() => (
              <>
                <StatRow
                  items={[
                    { label: t("office.admStockProducts"), value: sortedRows.length },
                    ...(showValue ? [{ label: t("ui.stockValue"), value: compactMoney(totalValue, "PYG").value, unit: compactMoney(totalValue, "PYG").unit }] : []),
                  ]}
                />
                {warehouses.length > 1 ? (
                  <FilterChips value={warehouseId} onChange={setWarehouseId} options={[{ value: "", label: t("ui.costAll") }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]} />
                ) : null}
                <Segmented<Tab>
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "stock", label: t("ui.stockTabStock") },
                    { value: "moves", label: t("ui.stockMoves") },
                    ...(lotRows.length > 0 ? [{ value: "expiring" as const, label: t("ui.expiringTitle") }] : []),
                  ]}
                />
                {tab === "stock" ? (
                  <DataList
                    rows={sortedRows}
                    keyOf={(r) => r.productId}
                    title={(r) => byId.get(r.productId)?.name ?? "—"}
                    subtitle={(r) => r.where || (r.valuePyg !== undefined ? fmtGs(r.valuePyg) : undefined)}
                    right={(r) => fmtQty(r.qty, unitOf(byId.get(r.productId)))}
                    empty={{ title: t("ui.emptyStockTitle"), hint: t("ui.emptyStockBody") }}
                  />
                ) : tab === "moves" ? (
                  <DataList
                    rows={moveRows}
                    keyOf={(m) => m.id}
                    title={(m) => byId.get(m.productId)?.name ?? "—"}
                    subtitle={(m) => [t(k(`ui.stockOrigin_${m.origin}`)), whName(m.warehouseId), isoShort(dayOf(m.occurredAt))].filter(Boolean).join(" · ")}
                    right={(m) => `${m.qty > 0 ? "+" : ""}${fmtQty(m.qty, unitOf(byId.get(m.productId)))}`}
                    empty={{ title: t("ui.erpEmpty"), hint: t("ui.emptyMovesBody") }}
                  />
                ) : (
                  <DataList
                    rows={lotRows}
                    keyOf={(l) => `${l.productId}-${l.lot}-${l.expiresOn}`}
                    title={(l) => byId.get(l.productId)?.name ?? "—"}
                    subtitle={(l) => [l.lot ? t("ui.expiringLot", { lot: l.lot }) : null, fmtQty(l.remaining, unitOf(byId.get(l.productId))), isoShort(l.expiresOn)].filter(Boolean).join(" · ")}
                    right={(l) => (l.daysLeft < 0 ? t("ui.expiringExpired", { n: -l.daysLeft }) : t("ui.expiringIn", { n: l.daysLeft }))}
                    empty={{ title: t("ui.erpEmpty") }}
                  />
                )}
              </>
            )}
          </OnlineState>
        )}
        <SectionHeader title={t("office.admStockMore")} />
        <Row icon={ClipboardCheck} title={t("ui.countTitle")} subtitle={t("office.admCountHint")} onPress={() => go("/stock-count")} />
        <Row icon={PackageMinus} title={t("ui.adminSection_minstock")} subtitle={t("office.admMinStockHint")} onPress={() => go("/office/admin/min-stock")} />
        <Row icon={Package} title={t("ui.adminSection_products")} subtitle={t("office.admProductsHint")} onPress={() => go("/office/products")} />
        <FormSheet visible={!!draft} title={t("ui.stockMode_adjustment")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.save")} pending={adjust.pending} error={err}>
          <SelectField label={t("ui.stockProduct")} value={draft?.productId} placeholder={t("ui.stockPick")} options={products.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => set({ productId: v })} />
          <SelectField label={t("ui.stockWarehouse")} value={draft?.warehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} onChange={(v) => set({ warehouseId: v })} />
          <SignToggle value={draft?.sign ?? "plus"} onChange={(v) => set({ sign: v })} />
          <TextField label={`${t("ui.stockQty")}${unitOf(byId.get(draft?.productId ?? "")) ? ` (${unitOf(byId.get(draft?.productId ?? ""))})` : ""}`} value={draft?.qty ?? ""} onChangeText={(v) => set({ qty: v })} kind="decimal" />
          <DateField label={t("ui.costDate")} value={draft?.date ?? ""} onChange={(v) => set({ date: v })} />
          <TextField label={t("ui.stockNote")} value={draft?.note ?? ""} onChangeText={(v) => set({ note: v })} maxLength={200} />
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}

function SignToggle({ value, onChange }: { value: "plus" | "minus"; onChange: (v: "plus" | "minus") => void }) {
  return (
    <>
      <SignLabel />
      <Segmented<"plus" | "minus"> value={value} onChange={onChange} options={[{ value: "plus", label: t("ui.stockAdjustPlus") }, { value: "minus", label: t("ui.stockAdjustMinus") }]} />
    </>
  );
}

function SignLabel() {
  return <Text style={[T.smallMedium, { marginTop: 16, marginBottom: 6 }]}>{t("ui.stockAdjustSign")}</Text>;
}
