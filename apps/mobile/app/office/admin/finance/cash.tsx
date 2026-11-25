/**
 * Caja y bancos: cuentas con saldo, movimientos recientes, por pagar y por cobrar. Alta rápida de un
 * gasto o un cobro y pago de una cuenta pendiente. API: GET /org/erp/cash/balances, /cash/moves, /payables,
 * /receivables, /parties; POST /org/erp/cash/moves y /cash/settle (apps/api/src/routes/erp/). Nada se guarda en el celular.
 */
import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { t } from "@yvy/shared";
import type { DueRow as Due } from "@yvy/shared";
import { AccountsTab, DuesTab, useCashQueries, type Tab } from "../../../../src/office/cash/CashTabs";
import { AccountSheet, MoveSheet, SettleSheet, type Account } from "../../../../src/office/cash/CashSheets";
import { NoAdminAccess, NoSignalNote, useManageErp, useNoSignalReason } from "../../../../src/office/erpCommon";
import { OfficeScreen } from "../../../../src/office/OfficeScreen";
import { Segmented } from "../../../../src/office/ui";


/** Caja: movimientos y saldos por moneda. */
export default function Cash() {
  const allowed = useManageErp();
  const [tab, setTab] = useState<Tab>("accounts");
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Due | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const { balances, moves, payables, receivables, parties } = useCashQueries(allowed, tab);
  const noSignal = useNoSignalReason();
  if (!allowed) return <NoAdminAccess title={t("ui.admin.section_cash")} />;

  const accounts = balances.data?.accounts ?? [];
  const partyName = (id: string | null) => parties.data?.find((p) => p.id === id)?.name;
  const accName = (id: string) => accounts.find((a) => a.id === id);
  const dueQuery = tab === "payables" ? payables : receivables;
  const query = tab === "accounts" ? balances : dueQuery;

  return (
    <OfficeScreen
      title={t("ui.admin.section_cash")}
      query={query}
      onRefresh={async () => {
        await Promise.all([balances.refresh(), moves.refresh(), tab === "accounts" ? undefined : dueQuery.refresh()]);
      }}
      action={accounts.length > 0 ? { label: t("office.cash.addMove"), icon: Plus, onPress: () => setAdding(true), disabled: !!noSignal } : undefined}
      footer={accounts.length > 0 ? <NoSignalNote /> : undefined}
    >
      <View style={{ marginTop: 16 }}>
        <Segmented<Tab>
          options={[
            { value: "accounts", label: t("ui.cash.accounts") },
            { value: "payables", label: t("ui.cash.payables") },
            { value: "receivables", label: t("ui.cash.receivables") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === "accounts" ? <AccountsTab balances={balances} moves={moves.data ?? []} onAccount={setAccount} /> : <DuesTab query={dueQuery} payable={tab === "payables"} partyName={partyName} onPay={setPaying} />}

      {adding ? <MoveSheet accounts={accounts} parties={parties.data ?? []} onClose={() => setAdding(false)} /> : null}
      {paying ? <SettleSheet due={paying} accounts={accounts} payable={tab === "payables"} onClose={() => setPaying(null)} /> : null}
      {account ? <AccountSheet account={account} onClose={() => setAccount(null)} /> : null}
    </OfficeScreen>
  );
}
