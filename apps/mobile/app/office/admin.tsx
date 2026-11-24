/**
 * Administración: índice con el Resumen arriba (caja, a pagar, a cobrar, margen, faltantes, órdenes, compras) y debajo
 * los módulos de la web (Compras y ventas, Stock, Operación, Finanzas) como filas. Todo viene de /org/erp (sin caché);
 * cada persona ve solo lo que la API le devuelve: el agrónomo, solo lo de stock.
 */
import { useMemo } from "react";
import { router, type Href } from "expo-router";
import { t, type Currency } from "@yvy/shared";
import { AdminGate, compactMoney, k, RightText, useAdminAccess, useParties, useProductMap, useWarehouses } from "../../src/office/adminKit";
import { ADMIN_GROUPS, ADMIN_GROUP_TITLE, ADMIN_MENU } from "../../src/office/adminMenu";
import { isoShort } from "../../src/office/erpCommon";
import { fmtMoney, fmtQty } from "../../src/office/money";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { Skeleton } from "../../src/office/state";
import { StatRow, type StatItem } from "../../src/office/ui";
import { useOnline } from "../../src/office/useOnline";
import { EmptyState, Row, SectionHeader } from "../../src/ui/kit";
import type { BalancesResponse as Balances, DuesTotalsResponse as Dues, LowStockApiRow as Low } from "@yvy/shared";

interface Purchase {
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

const SHOWN = 5;

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
function openOrders(rows: OrderRow[]) {
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

const go = (href: string) => router.push(href as Href);

export default function Admin() {
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

  const loading = manage ? [balances, payables, receivables, low, orders, purchases].some((q) => q.loading) : low.loading;
  const failed = manage && [balances, payables, receivables, low, orders, purchases].every((q) => q.error && q.data === null);

  const due = (d: Dues | null, key: "pending" | "overdue") => Object.fromEntries(Object.entries(d?.totals ?? {}).map(([c, v]) => [c, v[key]]));
  const margin = dash.data?.margin && dash.data.margin.entries > 0 ? dash.data.margin : null;
  const stats: StatItem[] = [
    ...currencyStats(t("ui.ov.cash"), balances.data?.totals, undefined, press("cash")),
    ...currencyStats(t("ui.ov.payables"), due(payables.data, "pending"), due(payables.data, "overdue"), press("cash")),
    ...currencyStats(t("ui.ov.receivables"), due(receivables.data, "pending"), undefined, press("cash")),
    ...(margin ? [{ label: t("ui.ov.margin"), value: compactMoney(margin.marginPyg, "PYG").value, unit: compactMoney(margin.marginPyg, "PYG").unit, tone: margin.marginPyg < 0 ? ("danger" as const) : undefined, onPress: press("results") }] : []),
  ];

  const lowRows = (low.data ?? []).slice(0, SHOWN);
  const open = useMemo(() => openOrders(orders.data ?? []), [orders.data]);
  const lastPurchases = [...(purchases.data ?? [])].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).slice(0, SHOWN);
  const partyName = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "—";
  const whName = (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "";

  const nothing = stats.length === 0 && lowRows.length === 0 && open.length === 0 && lastPurchases.length === 0;
  const steps = [
    { id: "products", label: t("ui.ov.step1"), done: byId.size > 0 },
    { id: "purchases", label: t("ui.ov.step2"), done: (purchases.data ?? []).length > 0 },
    { id: "cash", label: t("ui.ov.step3"), done: (balances.data?.accounts ?? []).length > 0 },
  ].filter((x) => !x.done);

  const refresh = async () => {
    await Promise.all(all.map((q) => q.refresh()));
  };

  const groups = ADMIN_GROUPS.map((g) => ({ group: g, items: ADMIN_MENU.filter((m) => m.group === g && (m.show ? m.show(access) : manage)) })).filter((g) => g.items.length > 0);

  return (
    <AdminGate need="stock" title={t("ui.nav.admin")}>
      <OfficeScreen title={t("ui.nav.admin")} query={manage ? balances : low} onRefresh={refresh}>
        <SectionHeader title={t("ui.admin.group_overview")} first />
        {loading ? (
          <Skeleton rows={3} />
        ) : failed ? (
          <EmptyState title={t("office.common.loadFailed")} hint={balances.error ?? undefined} action={t("office.common.retry")} onAction={() => void refresh()} />
        ) : nothing ? (
          manage ? (
            <>
              <EmptyState title={t("ui.ov.startTitle")} hint={t("ui.ov.startBody")} />
              {steps.map((x, i) => (
                <Row key={x.id} title={`${i + 1}. ${x.label}`} onPress={press(x.id) ?? (x.id === "cash" ? undefined : () => go(x.id === "products" ? "/office/products" : "/office/admin/purchases"))} />
              ))}
            </>
          ) : (
            <EmptyState title={t("ui.empty.lowTitle")} />
          )
        ) : (
          <>
            {stats.length > 0 ? <StatRow items={stats} /> : null}
            {lowRows.length > 0 ? (
              <>
                <SectionHeader title={`${t("ui.ov.low")} · ${low.data?.length ?? 0}`} action={t("ui.ov.seeAll")} onAction={() => go("/office/admin/min-stock")} />
                {lowRows.map((l) => {
                  const p = byId.get(l.productId);
                  return <Row key={`${l.productId}-${l.warehouseId}`} title={p?.name ?? "—"} subtitle={whName(l.warehouseId)} right={<RightText>{t("ui.min.stockMissing", { qty: fmtQty(l.missing, p?.unit) })}</RightText>} onPress={() => go("/office/admin/min-stock")} />;
                })}
              </>
            ) : null}
            {open.length > 0 ? (
              <>
                <SectionHeader title={`${t("ui.ov.orders")} · ${open.length}`} action={hrefOf("orders") ? t("ui.ov.seeAll") : undefined} onAction={press("orders")} />
                {open.slice(0, SHOWN).map((g) => (
                  <Row key={g.key} title={t(k(`ui.order.labor_${g.labor}`))} subtitle={g.plots.join(", ")} right={<RightText>{isoShort(g.dueDate)}</RightText>} onPress={press("orders")} />
                ))}
              </>
            ) : null}
            {lastPurchases.length > 0 ? (
              <>
                <SectionHeader title={t("ui.ov.purchases")} action={t("ui.ov.seeAll")} onAction={() => go("/office/admin/purchases")} />
                {lastPurchases.map((p) => (
                  <Row key={p.id} title={partyName(p.partyId)} subtitle={isoShort(p.orderDate)} right={<RightText>{fmtMoney(p.totalAmount, p.currency)}</RightText>} onPress={() => go("/office/admin/purchases")} />
                ))}
              </>
            ) : null}
          </>
        )}
        {groups.map((g) => (
          <GroupRows key={g.group} title={t(ADMIN_GROUP_TITLE[g.group])} items={g.items} />
        ))}
      </OfficeScreen>
    </AdminGate>
  );
}

function GroupRows({ title, items }: { title: string; items: typeof ADMIN_MENU }) {
  return (
    <>
      <SectionHeader title={title} />
      {items.map((m) => (
        <Row key={m.id} icon={m.icon} title={t(m.title)} subtitle={m.hint ? t(m.hint) : undefined} onPress={() => go(m.href)} />
      ))}
    </>
  );
}
