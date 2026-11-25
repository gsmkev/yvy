/** Datos del Resumen de Administración: consultas de caja, deudas, faltantes, órdenes y compras, y lo que se muestra de cada una. */
import { useMemo } from "react";
import { t, type BalancesResponse as Balances, type Currency, type DuesTotalsResponse as Dues, type LowStockApiRow as Low } from "@yvy/shared";
import { compactMoney, useAdminAccess, useParties, useProductMap, useWarehouses } from "../adminKit";
import { ADMIN_GROUPS, ADMIN_MENU } from "../adminMenu";
import type { StatItem } from "../ui";
import { useOnline } from "../useOnline";

/** Compra reciente. */
export interface Purchase {
  id: string;
  partyId: string | null;
  orderDate: string;
  currency: Currency;
  totalAmount: number;
}
interface OrderRow {
  id: string;
  farmId: string;
  assigneeId: string;
  plotName: string | null;
  dueDate: string;
  status: "open" | "done" | "cancelled";
  order: { labor: string } & Record<string, unknown>;
  createdAt: number;
}
interface Dashboard {
  margin: { marginPyg: number; incomePyg: number; costPyg: number; entries: number } | null;
}
/** Orden de trabajo abierta con sus lotes. */
export interface OpenOrder {
  key: string;
  labor: string;
  plots: string[];
  dueDate: string;
}

/** Cuántas filas de cada lista se muestran en el Resumen. */
export const SHOWN = 5;

/** Una cifra por moneda con saldo (pesos primero); `tone` rojo si esa moneda tiene algo vencido. */
function currencyStats(label: string, totals: Record<string, number> | undefined, overdue: Record<string, number> | undefined, onPress?: () => void): StatItem[] {
  return Object.entries(totals ?? {})
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => (a === "PYG" ? -1 : b === "PYG" ? 1 : a.localeCompare(b)))
    .map(([cur, v]) => {
      const c = compactMoney(v, cur as Currency);
      return { label, value: c.value, unit: c.unit, tone: (overdue?.[cur] ?? 0) > 0 ? ("danger" as const) : undefined, onPress };
    });
}

/** Junta las tareas de una misma orden (como `groupOrders` de la web); abierta si queda algún lote sin cerrar. */
function openOrders(rows: OrderRow[]): OpenOrder[] {
  const groups = new Map<string, OrderRow[]>();
  for (const r of rows) {
    const key = [r.createdAt, r.farmId, r.assigneeId, r.dueDate, JSON.stringify(r.order)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .filter(([, rs]) => rs.some((r) => r.status === "open"))
    .map(([key, rs]) => ({ key, labor: rs[0]!.order.labor, plots: rs.map((r) => r.plotName ?? "—"), dueDate: rs[0]!.dueDate }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

const due = (d: Dues | null, key: "pending" | "overdue") => Object.fromEntries(Object.entries(d?.totals ?? {}).map(([c, v]) => [c, v[key]]));

/** Cifras de arriba del Resumen: caja, a pagar, a cobrar y margen, solo las que tienen algo. */
function overviewStats(d: { balances: Balances | null; payables: Dues | null; receivables: Dues | null; margin: Dashboard["margin"] }, press: (id: string) => (() => void) | undefined): StatItem[] {
  const margin = d.margin && d.margin.entries > 0 ? d.margin : null;
  const m = margin ? compactMoney(margin.marginPyg, "PYG") : null;
  return [
    ...currencyStats(t("ui.ov.cash"), d.balances?.totals, undefined, press("cash")),
    ...currencyStats(t("ui.ov.payables"), due(d.payables, "pending"), due(d.payables, "overdue"), press("cash")),
    ...currencyStats(t("ui.ov.receivables"), due(d.receivables, "pending"), undefined, press("cash")),
    ...(margin && m ? [{ label: t("ui.ov.margin"), value: m.value, unit: m.unit, tone: margin.marginPyg < 0 ? ("danger" as const) : undefined, onPress: press("results") }] : []),
  ];
}

/** Módulos del menú por grupo, solo los que la persona puede abrir. */
function menuGroups(access: ReturnType<typeof useAdminAccess>) {
  return ADMIN_GROUPS.map((g) => ({ group: g, items: ADMIN_MENU.filter((m) => m.group === g && (m.show ? m.show(access) : access.manage)) })).filter((g) => g.items.length > 0);
}

/** Consulta todo lo del Resumen; cada persona recibe solo lo que la API le deja ver. */
export function useOverview(go: (href: string) => void) {
  const access = useAdminAccess();
  const { manage } = access;
  const balances = useOnline<Balances>(manage ? "/org/erp/cash/balances" : null);
  const payables = useOnline<Dues>(manage ? "/org/erp/payables" : null);
  const receivables = useOnline<Dues>(manage ? "/org/erp/receivables" : null);
  const dash = useOnline<Dashboard>(manage ? "/org/dashboard" : null, { cache: false });
  const low = useOnline<Low[]>(access.stock ? "/org/erp/stock/low" : null);
  const orders = useOnline<OrderRow[]>(manage ? "/org/erp/work-orders" : null);
  const purchases = useOnline<Purchase[]>(manage ? "/org/erp/purchases" : null);
  const parties = useParties(manage);
  const warehouses = useWarehouses();
  const { byId } = useProductMap();
  const all = [balances, payables, receivables, dash, low, orders, purchases, parties, warehouses];

  const hrefOf = (id: string) => ADMIN_MENU.find((m) => m.id === id)?.href;
  const press = (id: string) => {
    const h = hrefOf(id);
    return h ? () => go(h) : undefined;
  };

  const main = [balances, payables, receivables, low, orders, purchases];
  const stats = overviewStats({ balances: balances.data, payables: payables.data, receivables: receivables.data, margin: dash.data?.margin ?? null }, press);
  const lowRows = (low.data ?? []).slice(0, SHOWN);
  const open = useMemo(() => openOrders(orders.data ?? []), [orders.data]);
  const lastPurchases = [...(purchases.data ?? [])].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).slice(0, SHOWN);
  const steps = [
    { id: "products", label: t("ui.ov.step1"), done: byId.size > 0 },
    { id: "purchases", label: t("ui.ov.step2"), done: (purchases.data ?? []).length > 0 },
    { id: "cash", label: t("ui.ov.step3"), done: (balances.data?.accounts ?? []).length > 0 },
  ].filter((x) => !x.done);
  const groups = menuGroups(access);

  return {
    manage,
    balances,
    low,
    byId,
    stats,
    lowRows,
    open,
    lastPurchases,
    steps,
    groups,
    hrefOf,
    press,
    partyName: (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "—",
    whName: (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "",
    loading: manage ? main.some((q) => q.loading) : low.loading,
    failed: manage && main.every((q) => q.error && q.data === null),
    nothing: stats.length === 0 && lowRows.length === 0 && open.length === 0 && lastPurchases.length === 0,
    refresh: async () => {
      await Promise.all(all.map((q) => q.refresh()));
    },
  };
}

/** Datos del Resumen ya resumidos para dibujarlo. */
export type Overview = ReturnType<typeof useOverview>;
