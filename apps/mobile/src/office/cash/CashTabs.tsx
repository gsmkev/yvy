/** Pestañas de Caja y bancos: cuentas con movimientos recientes, y cuentas por pagar o por cobrar. */
import { t, type Currency, type MessageKey } from "@yvy/shared";
import type { DueRow as Due, DuesResponse as Dues } from "@yvy/shared";
import { SectionHeader, Text } from "../../ui/kit";
import { C, T } from "../../ui/theme";
import { isoShort, MoneyStats, useErp, type Party } from "../erpCommon";
import { fmtMoney } from "../money";
import { OnlineState } from "../state";
import { DataList } from "../ui";
import type { Account, Balances, Move } from "./CashSheets";

/** Pestaña de Caja y bancos. */
export type Tab = "accounts" | "payables" | "receivables";

/** Consultas de Caja: las de la pestaña de deudas solo se piden cuando se abre. */
export function useCashQueries(allowed: boolean, tab: Tab) {
  const on = (path: string, show = true) => (allowed && show ? path : null);
  return {
    balances: useErp<Balances>(on("/org/erp/cash/balances")),
    moves: useErp<Move[]>(on("/org/erp/cash/moves")),
    payables: useErp<Dues>(on("/org/erp/payables", tab === "payables")),
    receivables: useErp<Dues>(on("/org/erp/receivables", tab === "receivables")),
    parties: useErp<Party[]>(on("/org/erp/parties")),
  };
}

const key = (k: string) => k as MessageKey;

interface AccountsProps {
  balances: ReturnType<typeof useErp<Balances>>;
  moves: Move[];
  onAccount: (a: Account) => void;
}

/** Cuentas con saldo por moneda y los últimos movimientos. */
export function AccountsTab({ balances, moves, onAccount }: AccountsProps) {
  return (
    <OnlineState query={balances} empty={{ title: t("ui.cash.emptyTitle"), hint: t("office.cash.emptyHintApp") }} isEmpty={(d) => d.accounts.length === 0}>
      {(d) => {
        const accName = (id: string) => d.accounts.find((a) => a.id === id);
        return (
          <>
            <MoneyStats items={Object.entries(d.totals).map(([cur, total]) => ({ label: t("ui.cash.total", { currency: cur }), value: fmtMoney(total, cur as Currency), tone: total < 0 ? ("danger" as const) : undefined }))} />
            <SectionHeader title={t("ui.cash.accounts")} />
            <DataList
              rows={d.accounts}
              keyOf={(a) => a.id}
              title={(a) => a.name}
              subtitle={(a) => `${t(key(`ui.cash.type_${a.type}`))}, ${a.currency}`}
              right={(a) => <Text style={[T.bodyMedium, a.balance < 0 && { color: C.peligro }]}>{fmtMoney(a.balance, a.currency)}</Text>}
              onPress={onAccount}
              empty={{ title: t("ui.cash.emptyTitle") }}
            />
            {moves.length > 0 ? (
              <>
                <SectionHeader title={t("office.cash.recentMoves")} />
                <DataList
                  rows={moves.slice(0, 8)}
                  keyOf={(m) => m.id}
                  title={(m) => m.description || (m.amount < 0 ? t("ui.cash.out") : t("ui.cash.in"))}
                  subtitle={(m) => `${isoShort(m.date)}, ${accName(m.accountId)?.name ?? ""}`}
                  right={(m) => <Text style={[T.bodyMedium, m.amount < 0 && { color: C.peligro }]}>{fmtMoney(m.amount, accName(m.accountId)?.currency ?? "PYG")}</Text>}
                  empty={{ title: t("ui.cash.noMoves") }}
                />
              </>
            ) : null}
          </>
        );
      }}
    </OnlineState>
  );
}

interface DuesProps {
  query: ReturnType<typeof useErp<Dues>>;
  payable: boolean;
  partyName: (id: string | null) => string | undefined;
  onPay: (d: Due) => void;
}

/** Cuentas pendientes de pago o de cobro con lo vencido destacado. */
export function DuesTab({ query, payable, partyName, onPay }: DuesProps) {
  const empty = payable ? { title: t("ui.cash.payablesEmptyTitle"), hint: t("ui.cash.payablesEmptyHint") } : { title: t("ui.cash.receivablesEmptyTitle"), hint: t("ui.cash.receivablesEmptyHint") };
  return (
    <OnlineState query={query} isEmpty={(d) => d.rows.length === 0} empty={empty}>
      {(d) => (
        <>
          <MoneyStats
            items={Object.entries(d.totals).flatMap(([cur, v]) => [
              { label: t("ui.cash.pending", { currency: cur }), value: fmtMoney(v.pending, cur as Currency) },
              ...(v.overdue > 0 ? [{ label: t("office.cash.overdueLabel", { currency: cur }), value: fmtMoney(v.overdue, cur as Currency), tone: "danger" as const }] : []),
            ])}
          />
          <SectionHeader title={payable ? t("ui.cash.payables") : t("ui.cash.receivables")} />
          <DataList
            rows={d.rows}
            keyOf={(r) => `${r.docKind}-${r.docId}`}
            title={(r) => r.label}
            subtitle={(r) => [partyName(r.partyId), r.dueDate ? `${t("ui.cash.due")} ${isoShort(r.dueDate)}` : t("ui.cash.noDue")].filter(Boolean).join(", ")}
            right={(r) => <Text style={[T.bodyMedium, r.status === "overdue" && { color: C.peligro }]}>{fmtMoney(r.pending, r.currency)}</Text>}
            onPress={onPay}
            empty={{ title: t("ui.erp.empty") }}
          />
        </>
      )}
    </OnlineState>
  );
}
