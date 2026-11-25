/** Secciones del Resumen de Administración: cifras, faltantes, órdenes abiertas, últimas compras y primeros pasos. */
import { t } from "@yvy/shared";
import { EmptyState, Row, SectionHeader } from "../../ui/kit";
import { k, RightText } from "../adminKit";
import { isoShort } from "../erpCommon";
import { fmtMoney, fmtQty } from "../money";
import { Skeleton } from "../state";
import { StatRow } from "../ui";
import { SHOWN, type Overview } from "./useOverview";

interface Props {
  ov: Overview;
  go: (href: string) => void;
}

function LowSection({ ov, go }: Props) {
  if (ov.lowRows.length === 0) return null;
  return (
    <>
      <SectionHeader title={`${t("ui.ov.low")}, ${ov.low.data?.length ?? 0}`} action={t("ui.ov.seeAll")} onAction={() => go("/office/admin/min-stock")} />
      {ov.lowRows.map((l) => {
        const p = ov.byId.get(l.productId);
        return <Row key={`${l.productId}-${l.warehouseId}`} title={p?.name ?? "—"} subtitle={ov.whName(l.warehouseId)} right={<RightText>{t("ui.min.stockMissing", { qty: fmtQty(l.missing, p?.unit) })}</RightText>} onPress={() => go("/office/admin/min-stock")} />;
      })}
    </>
  );
}

function OrdersSection({ ov }: Props) {
  if (ov.open.length === 0) return null;
  return (
    <>
      <SectionHeader title={`${t("ui.ov.orders")}, ${ov.open.length}`} action={ov.hrefOf("orders") ? t("ui.ov.seeAll") : undefined} onAction={ov.press("orders")} />
      {ov.open.slice(0, SHOWN).map((g) => (
        <Row key={g.key} title={t(k(`ui.order.labor_${g.labor}`))} subtitle={g.plots.join(", ")} right={<RightText>{isoShort(g.dueDate)}</RightText>} onPress={ov.press("orders")} />
      ))}
    </>
  );
}

function PurchasesSection({ ov, go }: Props) {
  if (ov.lastPurchases.length === 0) return null;
  return (
    <>
      <SectionHeader title={t("ui.ov.purchases")} action={t("ui.ov.seeAll")} onAction={() => go("/office/admin/purchases")} />
      {ov.lastPurchases.map((p) => (
        <Row key={p.id} title={ov.partyName(p.partyId)} subtitle={isoShort(p.orderDate)} right={<RightText>{fmtMoney(p.totalAmount, p.currency)}</RightText>} onPress={() => go("/office/admin/purchases")} />
      ))}
    </>
  );
}

/** Primeros pasos cuando todavía no hay nada cargado (o el aviso de que no hay faltantes). */
function Empty({ ov, go }: Props) {
  if (!ov.manage) return <EmptyState title={t("ui.empty.lowTitle")} />;
  const stepHref = (id: string) => ov.press(id) ?? (id === "cash" ? undefined : () => go(id === "products" ? "/office/products" : "/office/admin/purchases"));
  return (
    <>
      <EmptyState title={t("ui.ov.startTitle")} hint={t("ui.ov.startBody")} />
      {ov.steps.map((x, i) => (
        <Row key={x.id} title={`${i + 1}. ${x.label}`} onPress={stepHref(x.id)} />
      ))}
    </>
  );
}

/** Cuerpo del Resumen: carga, error, vacío o las secciones con datos. */
export function OverviewBody({ ov, go }: Props) {
  if (ov.loading) return <Skeleton rows={3} />;
  if (ov.failed) return <EmptyState title={t("office.common.loadFailed")} hint={ov.balances.error ?? undefined} action={t("office.common.retry")} onAction={() => void ov.refresh()} />;
  if (ov.nothing) return <Empty ov={ov} go={go} />;
  return (
    <>
      {ov.stats.length > 0 ? <StatRow items={ov.stats} /> : null}
      <LowSection ov={ov} go={go} />
      <OrdersSection ov={ov} go={go} />
      <PurchasesSection ov={ov} go={go} />
    </>
  );
}
