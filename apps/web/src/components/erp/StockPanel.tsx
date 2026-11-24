/** Inventario (E-11): stock por producto y depósito, costo promedio y movimientos de compra, consumo, transferencia y ajuste. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post, qs } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs, fmtMoney, fmtQty } from "../../lib/money";
import { useFarm, useFarms } from "../../lib/queries";
import { useProducts } from "../../lib/products";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, FilterBar, FormFooter, Input, Modal, Select, Spinner, Tabs, toast } from "../ui";
import { PhotoRowMenu } from "./InvoicePhoto";
import { HeaderActions, RowMenu, useGoSection, useTableExport } from "./adminSlot";
import { ActionMenu } from "../menus";
import { useParties } from "./PartiesPanel";
import { useWarehouses } from "./WarehousesPanel";

interface Summary {
  rows: { productId: string; warehouseId: string; qty: number; valuePyg?: number }[];
  products: { productId: string; qty: number; valuePyg?: number; avgCostPyg?: number }[];
}

interface StockMove {
  id: string;
  productId: string;
  warehouseId: string;
  qty: number;
  valuePyg?: number;
  amount?: number | null;
  currency?: Currency | null;
  occurredAt: number;
  origin: "purchase" | "consumption" | "transfer" | "adjustment";
  originId: string | null;
  note: string | null;
  photoPath?: string | null;
}

type Mode = "purchase" | "consumption" | "transfer" | "adjustment";

interface ExpiringLot {
  productId: string;
  lot: string | null;
  expiresOn: string;
  daysLeft: number;
  remaining: number;
}

const useStock = () => useQuery({ queryKey: ["erp", "stock"], queryFn: () => get<Summary>("/org/erp/stock") });

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function StockPanel() {
  const stock = useStock();
  const products = useProducts();
  const warehouses = useWarehouses();
  const [productId, setProductId] = useState("");
  const moves = useQuery({
    queryKey: ["erp", "stock-moves", productId],
    queryFn: () => get<StockMove[]>(`/org/erp/stock/moves${qs({ productId: productId || undefined })}`),
  });
  const expiring = useQuery({ queryKey: ["erp", "expiring"], queryFn: () => get<ExpiringLot[]>("/org/erp/stock/expiring") });
  const [mode, setMode] = useState<Mode | null>(null);
  const [tab, setTab] = useState<"stock" | "moves" | "expiring">("stock");
  const exp = useTableExport(tab === "stock" ? "stock" : tab === "moves" ? "movimientos-de-stock" : "stock-por-vencer");
  const goSection = useGoSection();
  const [removing, setRemoving] = useState<StockMove | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (m: StockMove) => del(`/org/erp/stock/moves/${m.id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (stock.isLoading || products.isLoading || warehouses.isLoading) return <Spinner />;
  if (stock.error) return <ErrorBox error={stock.error} />;
  const prod = (id: string) => products.data?.find((p) => p.id === id);
  const wh = (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "";
  const unit = (id: string) => tk(`fields.productUnit_${prod(id)?.unit ?? "l"}`);
  const list = stock.data?.products ?? [];
  const lots = expiring.data ?? [];
  const moveRows = moves.data ?? [];
  const needProduct = (products.data ?? []).length === 0;
  const needWarehouse = (warehouses.data ?? []).length === 0;
  if (needProduct || needWarehouse)
    return (
      <EmptyState
        title={t(needProduct ? "ui.stockNeedProductTitle" : "ui.stockNeedWarehouseTitle")}
        action={
          <Button variant="primary" onClick={() => goSection(needProduct ? "products" : "warehouses")}>
            {t(needProduct ? "ui.productLoad" : "ui.warehouseLoad")}
          </Button>
        }
      >
        {t(needProduct ? "ui.stockNeedProductBody" : "ui.stockNeedWarehouseBody")}
      </EmptyState>
    );
  const stockCols: Column<Summary["products"][number]>[] = [
    { id: "product", header: t("ui.stockProduct"), cell: (p) => prod(p.productId)?.name ?? p.productId, sort: (a, b) => (prod(a.productId)?.name ?? "").localeCompare(prod(b.productId)?.name ?? "") },
    {
      id: "where",
      header: t("ui.stockWhere"),
      hideBelow: "md",
      cell: (p) => (
        <span className="text-tinta-2">
          {(stock.data?.rows ?? [])
            .filter((r) => r.productId === p.productId && Math.abs(r.qty) > 1e-9)
            .map((r) => `${wh(r.warehouseId)}: ${fmtQty(r.qty)}`)
            .join(" · ")}
        </span>
      ),
    },
    { id: "qty", header: t("ui.stockQty"), align: "right", cell: (p) => <span className={p.qty < 0 ? "text-peligro" : ""}>{fmtQty(p.qty, unit(p.productId))}</span>, sort: (a, b) => a.qty - b.qty },
    ...(list[0]?.avgCostPyg !== undefined ? [{ id: "avg", header: t("ui.stockAvgCost"), align: "right", hideBelow: "lg", cell: (p: Summary["products"][number]) => (p.avgCostPyg === undefined ? "" : fmtGs(p.avgCostPyg)) } satisfies Column<Summary["products"][number]>] : []),
    ...(list[0]?.valuePyg !== undefined ? [{ id: "value", header: t("ui.stockValue"), align: "right", hideBelow: "sm", cell: (p: Summary["products"][number]) => (p.valuePyg === undefined ? "" : fmtGs(p.valuePyg)), sort: (a: Summary["products"][number], b: Summary["products"][number]) => (a.valuePyg ?? 0) - (b.valuePyg ?? 0) } satisfies Column<Summary["products"][number]>] : []),
  ];
  const moveCols: Column<StockMove>[] = [
    { id: "date", header: t("ui.costDate"), cell: (m) => <span className="num whitespace-nowrap">{fmtIsoDate(dayOf(m.occurredAt))}</span> },
    {
      id: "origin",
      header: t("ui.stockOrigin"),
      hideBelow: "sm",
      cell: (m) => (
        <>
          {tk(`ui.stockOrigin_${m.origin}`)}
          {m.originId && m.origin === "consumption" && <span className="block text-xs text-tinta-2">{t("ui.costFromRecord")}</span>}
        </>
      ),
    },
    {
      id: "product",
      header: t("ui.stockProduct"),
      cell: (m) => (
        <>
          {prod(m.productId)?.name}
          <span className="block text-xs font-normal text-tinta-2">{wh(m.warehouseId)}</span>
        </>
      ),
    },
    {
      id: "qty",
      header: t("ui.stockQty"),
      align: "right",
      cell: (m) => (
        <span className={m.qty < 0 ? "" : "text-accion"}>
          {m.qty > 0 ? "+" : ""}
          {fmtQty(m.qty, unit(m.productId))}
        </span>
      ),
    },
    ...(moveRows.some((m) => m.valuePyg !== undefined)
      ? [
          {
            id: "value",
            header: t("ui.stockValue"),
            align: "right",
            hideBelow: "md",
            cell: (m: StockMove) =>
              m.valuePyg === undefined ? (
                ""
              ) : (
                <>
                  {m.amount != null && m.currency ? fmtMoney(m.amount, m.currency) : fmtGs(Math.abs(m.valuePyg))}
                  {m.currency === "USD" && <span className="block text-xs text-tinta-2">{fmtGs(m.valuePyg)}</span>}
                </>
              ),
          } satisfies Column<StockMove>,
        ]
      : []),
    {
      id: "menu",
      header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (m) =>
        m.valuePyg !== undefined && m.origin === "purchase" ? (
          <PhotoRowMenu kind="stock-moves" id={m.id} hasPhoto={!!m.photoPath} name={fmtIsoDate(dayOf(m.occurredAt))} onDelete={() => setRemoving(m)} />
        ) : (
          <RowMenu name={fmtIsoDate(dayOf(m.occurredAt))} onDelete={m.origin === "consumption" && m.originId ? undefined : () => setRemoving(m)} />
        ),
    },
  ];
  const expiringCols: Column<ExpiringLot>[] = [
    { id: "product", header: t("ui.stockProduct"), cell: (l) => prod(l.productId)?.name },
    { id: "lot", header: t("ui.stockLot"), hideBelow: "sm", cell: (l) => <span className="text-tinta-2">{l.lot ?? ""}</span> },
    { id: "qty", header: t("ui.stockQty"), align: "right", hideBelow: "sm", cell: (l) => fmtQty(l.remaining, unit(l.productId)) },
    { id: "date", header: t("ui.stockExpires"), align: "right", cell: (l) => fmtIsoDate(l.expiresOn) },
    {
      id: "left",
      header: t("ui.expiringTitle"),
      align: "right",
      cell: (l) => <span className={l.daysLeft < 0 ? "text-peligro" : "text-trigo-texto"}>{l.daysLeft < 0 ? t("ui.expiringExpired", { n: -l.daysLeft }) : t("ui.expiringIn", { n: l.daysLeft })}</span>,
    },
  ];
  const shown = tab === "stock" ? list.length : tab === "moves" ? moveRows.length : lots.length;
  return (
    <div className="flex flex-col gap-4">
      <HeaderActions>
        <Button variant="primary" onClick={() => setMode("purchase")}>
          {t("ui.stockMode_purchase")}
        </Button>
        <ActionMenu
          label={t("ui.moreActions")}
          items={(["consumption", "transfer", "adjustment"] as const).map((m) => ({ label: t(`ui.stockMode_${m}`), onSelect: () => setMode(m) }))}
        />
      </HeaderActions>
      {shown > 0 && exp.menu}
      <Tabs
        tabs={[
          { id: "stock", label: t("ui.stockTabStock") },
          { id: "moves", label: t("ui.stockMoves") },
          ...(lots.length > 0 ? [{ id: "expiring" as const, label: t("ui.expiringTitle"), count: lots.length }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "moves" && (
        <FilterBar>
          <Select
            aria-label={t("ui.stockProduct")}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            options={[{ value: "", label: t("ui.costAll") }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          />
        </FilterBar>
      )}
      <div ref={exp.ref}>
        {tab === "stock" && (
          <DataTable
            columns={stockCols}
            rows={list}
            rowKey={(p) => p.productId}
            caption={t("ui.stockTabStock")}
            empty={
              <EmptyState title={t("ui.emptyStockTitle")} action={<Button variant="primary" onClick={() => setMode("purchase")}>{t("ui.stockMode_purchase")}</Button>}>
                {t("ui.emptyStockBody")}
              </EmptyState>
            }
          />
        )}
        {tab === "moves" &&
          (moves.isLoading ? (
            <Spinner />
          ) : (
            <DataTable columns={moveCols} rows={moveRows} rowKey={(m) => m.id} caption={t("ui.stockMoves")} empty={<EmptyState compact title={t("ui.erpEmpty")}>{t("ui.emptyMovesBody")}</EmptyState>} />
          ))}
        {tab === "expiring" && <DataTable columns={expiringCols} rows={lots} rowKey={(l) => `${l.productId}-${l.lot}-${l.expiresOn}`} caption={t("ui.expiringTitle")} />}
      </div>
      {mode && <MoveModal mode={mode} onClose={() => setMode(null)} />}
      {removing && (
        <ConfirmModal
          title={tk(`ui.stockOrigin_${removing.origin}`)}
          message={t("ui.stockDeleteConfirm")}
          confirmLabel={t("ui.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function MoveModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
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
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
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
      </form>
    </Modal>
  );
}
