/** Resumen de Administración: cómo está el negocio hoy. Solo usa lo que ya consultan los demás paneles. */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { plotsLabel } from "@yvy/shared";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs, fmtMoney, fmtQty } from "../../lib/money";
import { EmptyState, ErrorBox, SectionHead, Spinner, Stat } from "../ui";
import { SHOWN, useOverviewData, type OverviewData } from "./overview/useOverviewData";

const link = "text-meta text-tinta-2 underline-offset-4 hover:text-surco hover:underline";
const ROW = "flex items-baseline justify-between gap-3 py-2.5 text-sm";

function Block({ title, count, section, children }: { title: string; count: number; section: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <SectionHead
        title={title}
        count={count}
        action={
          <Link to="/administracion" search={{ s: section }} className={link}>
            {t("ui.ov.seeAll")}
          </Link>
        }
      />
      <ul className="divide-y divide-linea">{children}</ul>
    </section>
  );
}

/** Sin datos todavía: los pasos que faltan para empezar. */
function OverviewStart({ d }: { d: OverviewData }) {
  const steps = [
    { s: "products", label: t("ui.ov.step1"), done: d.hasProducts },
    { s: "purchases", label: t("ui.ov.step2"), done: d.hasPurchases },
    { s: "cash", label: t("ui.ov.step3"), done: d.hasAccounts },
  ].filter((x) => !x.done);
  return (
    <EmptyState title={t("ui.ov.startTitle")}>
      {t("ui.ov.startBody")}
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

function OverviewStats({ d }: { d: OverviewData }) {
  const { cash, pay, payOverdue, rec, recOverdue, margin } = d;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
      {cash && <Stat label={t("ui.ov.cash")} value={cash.value} note={cash.rest || undefined} />}
      {pay && <Stat label={t("ui.ov.payables")} value={pay.value} note={payOverdue ? t("ui.ov.overdue", { amount: payOverdue.value }) : t("ui.ov.noDue")} tone={payOverdue ? "danger" : undefined} />}
      {rec && <Stat label={t("ui.ov.receivables")} value={rec.value} note={recOverdue ? t("ui.ov.overdue", { amount: recOverdue.value }) : t("ui.ov.noDue")} />}
      {margin && (
        <Stat
          label={t("ui.ov.margin")}
          value={fmtGs(margin.marginPyg)}
          tone={margin.marginPyg < 0 ? "danger" : undefined}
          note={t("ui.dash.marginNote", { income: fmtGs(margin.incomePyg), cost: fmtGs(margin.costPyg) })}
        />
      )}
    </div>
  );
}

function OverviewLists({ d }: { d: OverviewData }) {
  const { lowRows, openOrders, lastPurchases, prodName, whName, partyName } = d;
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
      {lowRows.length > 0 && (
        <Block title={t("ui.ov.low")} count={d.lowCount} section="minstock">
          {lowRows.map((l) => {
            const p = prodName(l.productId);
            return (
              <li key={`${l.productId}-${l.warehouseId}`} className={ROW}>
                <span className="min-w-0 truncate">
                  <span className="font-medium">{p?.name}</span> <span className="text-tinta-2">{whName(l.warehouseId)}</span>
                </span>
                <span className="num shrink-0 text-trigo-texto">{t("ui.min.stockMissing", { qty: fmtQty(l.missing, p ? tk(`fields.product.unit_${p.unit}`) : "") })}</span>
              </li>
            );
          })}
        </Block>
      )}
      {openOrders.length > 0 && (
        <Block title={t("ui.ov.orders")} count={openOrders.length} section="orders">
          {openOrders.slice(0, SHOWN).map((g) => (
            <li key={g.key} className={ROW}>
              <span className="min-w-0 truncate">
                <span className="font-medium">{tk(`ui.order.labor_${g.labor}`)}</span> <span className="text-tinta-2">{plotsLabel(g.plotNames)}</span>
              </span>
              <span className="num shrink-0 text-tinta-2">{fmtIsoDate(g.dueDate)}</span>
            </li>
          ))}
        </Block>
      )}
      {lastPurchases.length > 0 && (
        <Block title={t("ui.ov.purchases")} count={d.purchasesCount} section="purchases">
          {lastPurchases.map((p) => (
            <li key={p.id} className={ROW}>
              <span className="min-w-0 truncate">
                <span className="font-medium">{partyName(p.partyId) || "—"}</span> <span className="num text-tinta-2">{fmtIsoDate(p.orderDate)}</span>
              </span>
              <span className="num shrink-0">{fmtMoney(p.totalAmount, p.currency)}</span>
            </li>
          ))}
        </Block>
      )}
    </div>
  );
}

/** Resumen de Administración: compras, cuentas, stock bajo y vencimientos. */
export function OverviewPanel() {
  const d = useOverviewData();
  if (d.loading) return <Spinner rows={4} h={72} />;
  if (d.failed) return <ErrorBox error={d.error} />;
  const hasLists = d.lowRows.length > 0 || d.openOrders.length > 0 || d.lastPurchases.length > 0;
  if (d.stats === 0 && !hasLists) return <OverviewStart d={d} />;
  return (
    <div className="flex flex-col gap-8">
      {d.stats > 0 && <OverviewStats d={d} />}
      {hasLists && <OverviewLists d={d} />}
    </div>
  );
}
