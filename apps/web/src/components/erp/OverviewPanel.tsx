/** Resumen de Administración: cómo está el negocio hoy. Solo usa lo que ya consultan los demás paneles. */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Currency, PurchaseStatus } from "@yvy/shared";
import { get } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs, fmtMoney, fmtQty } from "../../lib/money";
import { groupOrders, plotsLabel, type OrderRow } from "../../lib/workOrders";
import { useProducts } from "../../lib/products";
import { EmptyState, ErrorBox, SectionHead, Spinner, Stat } from "../ui";
import { useParties } from "./PartiesPanel";
import { useWarehouses } from "./WarehousesPanel";

interface Balances {
  accounts: { id: string }[];
  totals: Record<string, number>;
}
interface Dues {
  totals: Record<string, { pending: number; overdue: number }>;
}
interface Low {
  productId: string;
  warehouseId: string;
  missing: number;
}
interface Purchase {
  id: string;
  partyId: string | null;
  orderDate: string;
  currency: Currency;
  totalAmount: number;
  status: PurchaseStatus;
}
interface Dashboard {
  margin: { marginPyg: number; incomePyg: number; costPyg: number; entries: number } | null;
}

const SHOWN = 5;
const link = "text-meta text-tinta-2 underline-offset-4 hover:text-surco hover:underline";

/** Pesos primero; las demás monedas van en la nota. Null si no hay nada distinto de cero. */
function byCurrency(totals: Record<string, number> | undefined): { value: string; rest: string } | null {
  const lines = Object.entries(totals ?? {})
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => (a === "PYG" ? -1 : b === "PYG" ? 1 : a.localeCompare(b)))
    .map(([cur, v]) => fmtMoney(v, cur as Currency));
  return lines.length ? { value: lines[0]!, rest: lines.slice(1).join(" · ") } : null;
}

function Block({ title, count, section, children }: { title: string; count: number; section: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <SectionHead
        title={title}
        count={count}
        action={
          <Link to="/administracion" search={{ s: section }} className={link}>
            {t("ui.ovSeeAll")}
          </Link>
        }
      />
      <ul className="divide-y divide-linea">{children}</ul>
    </section>
  );
}

export function OverviewPanel() {
  const products = useProducts();
  const warehouses = useWarehouses();
  const parties = useParties();
  const balances = useQuery({ queryKey: ["erp", "cash-balances"], queryFn: () => get<Balances>("/org/erp/cash/balances") });
  const payables = useQuery({ queryKey: ["erp", "payables"], queryFn: () => get<Dues>("/org/erp/payables") });
  const receivables = useQuery({ queryKey: ["erp", "receivables"], queryFn: () => get<Dues>("/org/erp/receivables") });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dashboard>("/org/dashboard"), staleTime: 60_000 });
  const low = useQuery({ queryKey: ["erp", "stock-low"], queryFn: () => get<Low[]>("/org/erp/stock/low") });
  const orders = useQuery({ queryKey: ["erp", "orders"], queryFn: () => get<OrderRow[]>("/org/erp/work-orders") });
  const purchases = useQuery({ queryKey: ["erp", "purchases"], queryFn: () => get<Purchase[]>("/org/erp/purchases") });
  const all = [products, warehouses, parties, balances, payables, receivables, dash, low, orders, purchases];
  if (all.some((q) => q.isLoading)) return <Spinner rows={4} h={72} />;
  // Si todo falló no hay nada que mostrar; si falló una parte, se muestra el resto
  if (all.every((q) => q.error)) return <ErrorBox error={balances.error} />;

  const prodName = (id: string) => products.data?.find((p) => p.id === id);
  const whName = (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "";
  const partyName = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";

  const cash = byCurrency(balances.data?.totals);
  const pay = byCurrency(Object.fromEntries(Object.entries(payables.data?.totals ?? {}).map(([c, v]) => [c, v.pending])));
  const payOverdue = byCurrency(Object.fromEntries(Object.entries(payables.data?.totals ?? {}).map(([c, v]) => [c, v.overdue])));
  const rec = byCurrency(Object.fromEntries(Object.entries(receivables.data?.totals ?? {}).map(([c, v]) => [c, v.pending])));
  const recOverdue = byCurrency(Object.fromEntries(Object.entries(receivables.data?.totals ?? {}).map(([c, v]) => [c, v.overdue])));
  const margin = dash.data?.margin && dash.data.margin.entries > 0 ? dash.data.margin : null;
  const stats = [cash, pay, rec, margin].filter(Boolean).length;

  const lowRows = (low.data ?? []).slice(0, SHOWN);
  const openOrders = groupOrders(orders.data ?? []).filter((g) => g.status === "open");
  const lastPurchases = [...(purchases.data ?? [])].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).slice(0, SHOWN);

  if (stats === 0 && lowRows.length === 0 && openOrders.length === 0 && lastPurchases.length === 0) {
    const steps = [
      { s: "products", label: t("ui.ovStep1"), done: (products.data ?? []).length > 0 },
      { s: "purchases", label: t("ui.ovStep2"), done: (purchases.data ?? []).length > 0 },
      { s: "cash", label: t("ui.ovStep3"), done: (balances.data?.accounts ?? []).length > 0 },
    ].filter((x) => !x.done);
    return (
      <EmptyState title={t("ui.ovStartTitle")}>
        {t("ui.ovStartBody")}
        <ol className="mt-4 flex flex-col gap-2">
          {steps.map((x, i) => (
            <li key={x.s} className="flex items-center gap-3 text-body text-surco">
              <span className="num flex size-6 shrink-0 items-center justify-center rounded-full border border-linea text-meta text-tinta-2">{i + 1}</span>
              <Link to="/administracion" search={{ s: x.s }} className="underline underline-offset-4 hover:text-accion">
                {x.label}
              </Link>
            </li>
          ))}
        </ol>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          {cash && <Stat label={t("ui.ovCash")} value={cash.value} note={cash.rest || undefined} />}
          {pay && <Stat label={t("ui.ovPayables")} value={pay.value} note={payOverdue ? t("ui.ovOverdue", { amount: payOverdue.value }) : t("ui.ovNoDue")} tone={payOverdue ? "danger" : undefined} />}
          {rec && <Stat label={t("ui.ovReceivables")} value={rec.value} note={recOverdue ? t("ui.ovOverdue", { amount: recOverdue.value }) : t("ui.ovNoDue")} />}
          {margin && (
            <Stat
              label={t("ui.ovMargin")}
              value={fmtGs(margin.marginPyg)}
              tone={margin.marginPyg < 0 ? "danger" : undefined}
              note={t("ui.dashMarginNote", { income: fmtGs(margin.incomePyg), cost: fmtGs(margin.costPyg) })}
            />
          )}
        </div>
      )}
      {(lowRows.length > 0 || openOrders.length > 0 || lastPurchases.length > 0) && (
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
          {lowRows.length > 0 && (
            <Block title={t("ui.ovLow")} count={low.data?.length ?? 0} section="minstock">
              {lowRows.map((l) => {
                const p = prodName(l.productId);
                return (
                  <li key={`${l.productId}-${l.warehouseId}`} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{p?.name}</span> <span className="text-tinta-2">{whName(l.warehouseId)}</span>
                    </span>
                    <span className="num shrink-0 text-trigo-texto">{t("ui.minStockMissing", { qty: fmtQty(l.missing, p ? tk(`fields.productUnit_${p.unit}`) : "") })}</span>
                  </li>
                );
              })}
            </Block>
          )}
          {openOrders.length > 0 && (
            <Block title={t("ui.ovOrders")} count={openOrders.length} section="orders">
              {openOrders.slice(0, SHOWN).map((g) => (
                <li key={g.key} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{tk(`ui.orderLabor_${g.labor}`)}</span> <span className="text-tinta-2">{plotsLabel(g.plotNames)}</span>
                  </span>
                  <span className="num shrink-0 text-tinta-2">{fmtIsoDate(g.dueDate)}</span>
                </li>
              ))}
            </Block>
          )}
          {lastPurchases.length > 0 && (
            <Block title={t("ui.ovPurchases")} count={purchases.data?.length ?? 0} section="purchases">
              {lastPurchases.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{partyName(p.partyId) || "—"}</span> <span className="num text-tinta-2">{fmtIsoDate(p.orderDate)}</span>
                  </span>
                  <span className="num shrink-0">{fmtMoney(p.totalAmount, p.currency)}</span>
                </li>
              ))}
            </Block>
          )}
        </div>
      )}
    </div>
  );
}
