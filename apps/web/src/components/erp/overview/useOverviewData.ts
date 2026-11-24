import { useQuery } from "@tanstack/react-query";
import { groupOrders, type BalancesResponse as Balances, type Currency, type DuesTotalsResponse as Dues, type LowStockApiRow as Low, type OrderRow, type PurchaseStatus } from "@yvy/shared";
import { get } from "../../../lib/api";
import { fmtMoney } from "../../../lib/money";
import { useProducts } from "../../../lib/products";
import { useParties } from "../PartiesPanel";
import { useWarehouses } from "../WarehousesPanel";

export interface Purchase {
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

export const SHOWN = 5;

/** Pesos primero; las demás monedas van en la nota. Null si no hay nada distinto de cero. */
function byCurrency(totals: Record<string, number> | undefined): { value: string; rest: string } | null {
  const lines = Object.entries(totals ?? {})
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => (a === "PYG" ? -1 : b === "PYG" ? 1 : a.localeCompare(b)))
    .map(([cur, v]) => fmtMoney(v, cur as Currency));
  return lines.length ? { value: lines[0]!, rest: lines.slice(1).join(" · ") } : null;
}

const pick = (totals: Dues["totals"] | undefined, key: "pending" | "overdue") =>
  byCurrency(Object.fromEntries(Object.entries(totals ?? {}).map(([c, v]) => [c, v[key]])));

/** Todo lo que consulta el resumen de Administración, ya listo para dibujar. */
export function useOverviewData() {
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

  const cash = byCurrency(balances.data?.totals);
  const pay = pick(payables.data?.totals, "pending");
  const payOverdue = pick(payables.data?.totals, "overdue");
  const rec = pick(receivables.data?.totals, "pending");
  const recOverdue = pick(receivables.data?.totals, "overdue");
  const margin = dash.data?.margin && dash.data.margin.entries > 0 ? dash.data.margin : null;
  const lowRows = (low.data ?? []).slice(0, SHOWN);
  const openOrders = groupOrders(orders.data ?? []).filter((g) => g.status === "open");
  const lastPurchases = [...(purchases.data ?? [])].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).slice(0, SHOWN);
  return {
    loading: all.some((q) => q.isLoading),
    // Si todo falló no hay nada que mostrar; si falló una parte, se muestra el resto
    failed: all.every((q) => q.error),
    error: balances.error,
    cash, pay, payOverdue, rec, recOverdue, margin,
    stats: [cash, pay, rec, margin].filter(Boolean).length,
    lowRows,
    lowCount: low.data?.length ?? 0,
    openOrders,
    lastPurchases,
    purchasesCount: purchases.data?.length ?? 0,
    prodName: (id: string) => products.data?.find((p) => p.id === id),
    whName: (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "",
    partyName: (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "",
    hasProducts: (products.data ?? []).length > 0,
    hasPurchases: (purchases.data ?? []).length > 0,
    hasAccounts: (balances.data?.accounts ?? []).length > 0,
  };
}
export type OverviewData = ReturnType<typeof useOverviewData>;
