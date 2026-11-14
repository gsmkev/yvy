/** Inventario (E-11): stock por producto y depósito, costo promedio y movimientos de compra, consumo, transferencia y ajuste. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post, qs } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs, fmtMoney, fmtQty } from "../../lib/money";
import { useFarm, useFarms } from "../../lib/queries";
import { useProducts } from "../ProductsPanel";
import { Button, ConfirmModal, Empty, ErrorBox, Field, FormActions, Input, Modal, Select, Spinner, toast } from "../ui";
import { PhotoRowMenu } from "./InvoicePhoto";
import { HeaderActions, RowMenu } from "./adminSlot";
import { ActionMenu } from "../menus";
import { useParties } from "./PartiesPanel";
import { useWarehouses } from "./WarehousesPanel";
import { ExportableTable } from "../ExportableTable";

interface Summary {
  rows: { productId: string; warehouseId: string; qty: number; valuePyg?: number }[];
  products: { productId: string; qty: number; valuePyg?: number; avgCostPyg?: number }[];
}

export interface StockMove {
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

export const useStock = () => useQuery({ queryKey: ["erp", "stock"], queryFn: () => get<Summary>("/org/erp/stock") });

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
  return (
    <div className="flex flex-col gap-5">
      <HeaderActions>
        <Button variant="primary" onClick={() => setMode("purchase")}>
          {t("ui.stockMode_purchase")}
        </Button>
        <ActionMenu
          label={t("ui.moreActions")}
          items={(["consumption", "transfer", "adjustment"] as const).map((m) => ({ label: t(`ui.stockMode_${m}`), onSelect: () => setMode(m) }))}
        />
      </HeaderActions>
      {expiring.data && expiring.data.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="border-b border-linea pb-2 text-[18px] leading-6 font-semibold">{t("ui.expiringTitle")}</h2>
          <ExportableTable name="stock-por-vencer">
            <table className="w-full text-sm">
              <tbody>
                {expiring.data.map((l) => (
                  <tr key={`${l.productId}-${l.lot}-${l.expiresOn}`} className="border-b border-linea">
                    <td className="py-2.5 pr-4 font-medium">{prod(l.productId)?.name}</td>
                    <td className="py-2.5 pr-4 text-tinta-2">{l.lot ? t("ui.expiringLot", { lot: l.lot }) : ""}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtQty(l.remaining, unit(l.productId))}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtIsoDate(l.expiresOn)}</td>
                    <td className={`py-2.5 text-right ${l.daysLeft < 0 ? "text-peligro" : "text-trigo-texto"}`}>
                      {l.daysLeft < 0 ? t("ui.expiringExpired", { n: -l.daysLeft }) : t("ui.expiringIn", { n: l.daysLeft })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      {(warehouses.data ?? []).length === 0 && <p className="text-sm text-trigo-texto">{t("ui.stockNoWarehouse")}</p>}
      {list.length === 0 ? (
        <Empty>{t("ui.stockEmpty")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <ExportableTable name="stock">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-tinta-2">
                  <th className="py-2 pr-4 font-medium">{t("ui.stockProduct")}</th>
                  <th className="py-2 pr-4 font-medium">{t("ui.stockWhere")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.stockQty")}</th>
                  {list[0]?.avgCostPyg !== undefined && <th className="py-2 pr-4 text-right font-medium">{t("ui.stockAvgCost")}</th>}
                  {list[0]?.valuePyg !== undefined && <th className="py-2 text-right font-medium">{t("ui.stockValue")}</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.productId} className="border-b border-linea align-top">
                    <td className="py-2.5 pr-4 font-medium">{prod(p.productId)?.name ?? p.productId}</td>
                    <td className="py-2.5 pr-4 text-tinta-2">
                      {(stock.data?.rows ?? [])
                        .filter((r) => r.productId === p.productId && Math.abs(r.qty) > 1e-9)
                        .map((r) => `${wh(r.warehouseId)}: ${fmtQty(r.qty)}`)
                        .join(" · ")}
                    </td>
                    <td className={`num py-2.5 pr-4 text-right ${p.qty < 0 ? "text-peligro" : ""}`}>{fmtQty(p.qty, unit(p.productId))}</td>
                    {p.avgCostPyg !== undefined && <td className="num py-2.5 pr-4 text-right">{fmtGs(p.avgCostPyg)}</td>}
                    {p.valuePyg !== undefined && <td className="num py-2.5 text-right">{fmtGs(p.valuePyg)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-linea pb-2">
          <h2 className="text-[18px] leading-6 font-semibold">{t("ui.stockMoves")}</h2>
          <Select
            aria-label={t("ui.stockProduct")}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            options={[{ value: "", label: t("ui.costAll") }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          />
        </div>
        {moves.isLoading && <Spinner />}
        {moves.data && moves.data.length === 0 && <Empty>{t("ui.erpEmpty")}</Empty>}
        {moves.data && moves.data.length > 0 && (
          <div className="overflow-x-auto">
            <ExportableTable name="movimientos-de-stock">
              <table className="w-full text-sm">
                <tbody>
                  {moves.data.map((m) => (
                    <tr key={m.id} className="border-b border-linea">
                      <td className="num py-2.5 pr-4 whitespace-nowrap">{fmtIsoDate(dayOf(m.occurredAt))}</td>
                      <td className="py-2.5 pr-4">
                        {tk(`ui.stockOrigin_${m.origin}`)}
                        {m.originId && m.origin === "consumption" && <span className="block text-xs text-tinta-2">{t("ui.costFromRecord")}</span>}
                      </td>
                      <td className="py-2.5 pr-4">
                        {prod(m.productId)?.name}
                        <span className="block text-xs text-tinta-2">{wh(m.warehouseId)}</span>
                      </td>
                      <td className={`num py-2.5 pr-4 text-right ${m.qty < 0 ? "" : "text-accion"}`}>
                        {m.qty > 0 ? "+" : ""}
                        {fmtQty(m.qty, unit(m.productId))}
                      </td>
                      {m.valuePyg !== undefined && (
                        <td className="num py-2.5 pr-4 text-right">
                          {m.amount != null && m.currency ? fmtMoney(m.amount, m.currency) : fmtGs(Math.abs(m.valuePyg))}
                          {m.currency === "USD" && <span className="block text-xs text-tinta-2">{fmtGs(m.valuePyg)}</span>}
                        </td>
                      )}
                      <td className="sticky right-0 w-12 bg-lino py-1 text-right">
                        {m.valuePyg !== undefined && m.origin === "purchase" ? (
                          <PhotoRowMenu kind="stock-moves" id={m.id} hasPhoto={!!m.photoPath} name={fmtIsoDate(dayOf(m.occurredAt))} onDelete={() => setRemoving(m)} />
                        ) : (
                          <RowMenu
                            name={fmtIsoDate(dayOf(m.occurredAt))}
                            onDelete={m.origin === "consumption" && m.originId ? undefined : () => setRemoving(m)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ExportableTable>
          </div>
        )}
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
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <FormActions className="col-span-2" onCancel={onClose} disabled={save.isPending} />
      </form>
    </Modal>
  );
}
