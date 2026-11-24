/**
 * Caja y bancos: cuentas con saldo, movimientos recientes, por pagar y por cobrar. Alta rápida de un
 * gasto o un cobro y pago de una cuenta pendiente. API: GET /org/erp/cash/balances, /cash/moves, /payables,
 * /receivables, /parties; POST /org/erp/cash/moves y /cash/settle (apps/api/src/routes/erp/). Nada se guarda en el celular.
 */
import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { CASH_ACCOUNT_TYPES, fromMinor, localDate, t, type Currency, type MessageKey } from "@yvy/shared";
import { showToast } from "../../../../src/lib/toast";
import { isoShort, MoneyStats, NoAdminAccess, NoSignalNote, parseMinor, useErp, useManageErp, useNoSignalReason, type Party } from "../../../../src/office/erpCommon";
import { fmtNumber } from "../../../../src/office/format";
import { fmtMoney } from "../../../../src/office/money";
import { OfficeScreen } from "../../../../src/office/OfficeScreen";
import { OnlineState } from "../../../../src/office/state";
import { useOnlineMutation } from "../../../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, Segmented, SelectField, TextField } from "../../../../src/office/ui";
import { SectionHeader, Sheet, Text } from "../../../../src/ui/kit";
import { C, T } from "../../../../src/ui/theme";
import type { DueRow as Due, DuesResponse as Dues } from "@yvy/shared";

interface Account {
  id: string;
  name: string;
  type: (typeof CASH_ACCOUNT_TYPES)[number];
  currency: Currency;
  openingBalance: number;
  balance: number;
}
interface Balances {
  accounts: Account[];
  totals: Record<string, number>;
}
interface Move {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  description: string | null;
}

type Tab = "accounts" | "payables" | "receivables";
const key = (k: string) => k as MessageKey;
const INVALIDATE = ["/org/erp/cash", "/org/erp/payables", "/org/erp/receivables"];

/** Caja: movimientos y saldos por moneda. */
export default function Cash() {
  const allowed = useManageErp();
  const [tab, setTab] = useState<Tab>("accounts");
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Due | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const balances = useErp<Balances>(allowed ? "/org/erp/cash/balances" : null);
  const moves = useErp<Move[]>(allowed ? "/org/erp/cash/moves" : null);
  const payables = useErp<Dues>(allowed && tab === "payables" ? "/org/erp/payables" : null);
  const receivables = useErp<Dues>(allowed && tab === "receivables" ? "/org/erp/receivables" : null);
  const parties = useErp<Party[]>(allowed ? "/org/erp/parties" : null);
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

      {tab === "accounts" ? (
        <OnlineState query={balances} empty={{ title: t("ui.cash.emptyTitle"), hint: t("office.cash.emptyHintApp") }} isEmpty={(d) => d.accounts.length === 0}>
          {(d) => (
            <>
              <MoneyStats items={Object.entries(d.totals).map(([cur, total]) => ({ label: t("ui.cash.total", { currency: cur }), value: fmtMoney(total, cur as Currency), tone: total < 0 ? ("danger" as const) : undefined }))} />
              <SectionHeader title={t("ui.cash.accounts")} />
              <DataList
                rows={d.accounts}
                keyOf={(a) => a.id}
                title={(a) => a.name}
                subtitle={(a) => `${t(key(`ui.cash.type_${a.type}`))} · ${a.currency}`}
                right={(a) => <Text style={[T.bodyMedium, a.balance < 0 && { color: C.peligro }]}>{fmtMoney(a.balance, a.currency)}</Text>}
                onPress={setAccount}
                empty={{ title: t("ui.cash.emptyTitle") }}
              />
              {(moves.data ?? []).length > 0 ? (
                <>
                  <SectionHeader title={t("office.cash.recentMoves")} />
                  <DataList
                    rows={(moves.data ?? []).slice(0, 8)}
                    keyOf={(m) => m.id}
                    title={(m) => m.description || (m.amount < 0 ? t("ui.cash.out") : t("ui.cash.in"))}
                    subtitle={(m) => `${isoShort(m.date)} · ${accName(m.accountId)?.name ?? ""}`}
                    right={(m) => <Text style={[T.bodyMedium, m.amount < 0 && { color: C.peligro }]}>{fmtMoney(m.amount, accName(m.accountId)?.currency ?? "PYG")}</Text>}
                    empty={{ title: t("ui.cash.noMoves") }}
                  />
                </>
              ) : null}
            </>
          )}
        </OnlineState>
      ) : (
        <OnlineState
          query={dueQuery}
          isEmpty={(d) => d.rows.length === 0}
          empty={tab === "payables" ? { title: t("ui.cash.payablesEmptyTitle"), hint: t("ui.cash.payablesEmptyHint") } : { title: t("ui.cash.receivablesEmptyTitle"), hint: t("ui.cash.receivablesEmptyHint") }}
        >
          {(d) => (
            <>
              <MoneyStats
                items={Object.entries(d.totals).flatMap(([cur, v]) => [
                  { label: t("ui.cash.pending", { currency: cur }), value: fmtMoney(v.pending, cur as Currency) },
                  ...(v.overdue > 0 ? [{ label: t("office.cash.overdueLabel", { currency: cur }), value: fmtMoney(v.overdue, cur as Currency), tone: "danger" as const }] : []),
                ])}
              />
              <SectionHeader title={tab === "payables" ? t("ui.cash.payables") : t("ui.cash.receivables")} />
              <DataList
                rows={d.rows}
                keyOf={(r) => `${r.docKind}-${r.docId}`}
                title={(r) => r.label}
                subtitle={(r) => [partyName(r.partyId), r.dueDate ? `${t("ui.cash.due")} ${isoShort(r.dueDate)}` : t("ui.cash.noDue")].filter(Boolean).join(" · ")}
                right={(r) => <Text style={[T.bodyMedium, r.status === "overdue" && { color: C.peligro }]}>{fmtMoney(r.pending, r.currency)}</Text>}
                onPress={setPaying}
                empty={{ title: t("ui.erp.empty") }}
              />
            </>
          )}
        </OnlineState>
      )}

      {adding ? <MoveSheet accounts={accounts} parties={parties.data ?? []} onClose={() => setAdding(false)} /> : null}
      {paying ? <SettleSheet due={paying} accounts={accounts} payable={tab === "payables"} onClose={() => setPaying(null)} /> : null}
      {account ? <AccountSheet account={account} onClose={() => setAccount(null)} /> : null}
    </OfficeScreen>
  );
}

/** Movimientos de una cuenta. */
function AccountSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const q = useErp<Move[]>(`/org/erp/cash/moves?accountId=${account.id}`);
  return (
    <Sheet visible title={account.name} onClose={onClose}>
      <Text style={T.small}>{`${t("ui.cash.balance")}: ${fmtMoney(account.balance, account.currency)}`}</Text>
      <OnlineState query={q} skeletonRows={3} empty={{ title: t("ui.cash.noMoves") }} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <DataList
            rows={rows.slice(0, 30)}
            keyOf={(m) => m.id}
            title={(m) => m.description || (m.amount < 0 ? t("ui.cash.out") : t("ui.cash.in"))}
            subtitle={(m) => isoShort(m.date)}
            right={(m) => <Text style={[T.bodyMedium, m.amount < 0 && { color: C.peligro }]}>{fmtMoney(m.amount, account.currency)}</Text>}
            empty={{ title: t("ui.cash.noMoves") }}
          />
        )}
      </OnlineState>
    </Sheet>
  );
}

/** Alta rápida de un gasto (sale) o un cobro (entra). */
function MoveSheet({ accounts, parties, onClose }: { accounts: Account[]; parties: Party[]; onClose: () => void }) {
  const [dir, setDir] = useState<"out" | "in">("out");
  const [accountId, setAccountId] = useState((accounts.find((a) => a.currency === "PYG") ?? accounts[0])?.id ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDate(Date.now()));
  const [partyId, setPartyId] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; date?: string; description?: string }>({});
  const save = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/cash/moves", { invalidate: INVALIDATE });
  const acc = accounts.find((a) => a.id === accountId);
  const submit = async () => {
    if (!acc) return;
    const minor = parseMinor(amount, acc.currency);
    const e: typeof errors = {};
    if (minor === null) e.amount = t("office.common.moneyNeedsAmount");
    if (!date) e.date = t("office.common.invalidDate");
    if (!description.trim()) e.description = t("office.cash.needsConcept");
    setErrors(e);
    if (Object.keys(e).length || minor === null) return;
    const r = await save.mutate({ accountId, date, amount: dir === "out" ? -minor : minor, description: description.trim(), partyId: partyId || null });
    if (r.ok) {
      showToast(t("ui.erp.saved"));
      onClose();
    }
  };
  return (
    <FormSheet visible title={t("office.cash.addMove")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={save.error}>
      <View style={{ marginTop: 8 }}>
        <Segmented
          options={[
            { value: "out", label: t("office.cash.expense") },
            { value: "in", label: t("office.cash.income") },
          ]}
          value={dir}
          onChange={setDir}
        />
      </View>
      <SelectField label={t("ui.cash.account")} value={accountId} options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))} onChange={setAccountId} />
      <TextField label={t("office.cash.concept")} value={description} onChangeText={setDescription} maxLength={200} error={errors.description} />
      <TextField label={t("office.cash.amountIn", { currency: acc?.currency ?? "PYG" })} value={amount} onChangeText={setAmount} kind="decimal" error={errors.amount} placeholder="0" />
      <DateField label={t("ui.cost.date")} value={date} onChange={setDate} error={errors.date} />
      <SelectField label={t("office.cash.party")} value={partyId} placeholder={t("ui.common.none")} options={[{ value: "", label: t("ui.common.none") }, ...parties.map((p) => ({ value: p.id, label: p.name }))]} onChange={setPartyId} />
    </FormSheet>
  );
}

/** Registrar el pago (o el cobro) de una cuenta pendiente. */
function SettleSheet({ due, accounts, payable, onClose }: { due: Due; accounts: Account[]; payable: boolean; onClose: () => void }) {
  const options = accounts.filter((a) => a.currency === due.currency);
  const [accountId, setAccountId] = useState(options[0]?.id ?? "");
  const [amount, setAmount] = useState(fmtNumber(fromMinor(due.pending, due.currency), 2).replace(/\./g, ""));
  const [date, setDate] = useState(localDate(Date.now()));
  const [error, setError] = useState<string | null>(null);
  const save = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/cash/settle", { invalidate: INVALIDATE });
  const title = `${t(payable ? "ui.cash.pay" : "ui.cash.collect")}: ${due.label}`;
  const submit = async () => {
    const minor = parseMinor(amount, due.currency);
    if (minor === null) return setError(t("office.common.moneyNeedsAmount"));
    if (minor > due.pending) return setError(t("office.cash.overSettle"));
    if (!date) return setError(t("office.common.invalidDate"));
    setError(null);
    const r = await save.mutate({ docKind: due.docKind, docId: due.docId, accountId, date, amount: minor });
    if (r.ok) {
      showToast(t("ui.erp.saved"));
      onClose();
    }
  };
  if (options.length === 0)
    return (
      <Sheet visible title={title} onClose={onClose}>
        <Text style={T.body}>{t("ui.cash.noAccount", { currency: due.currency })}</Text>
      </Sheet>
    );
  return (
    <FormSheet visible title={title} onClose={onClose} onSubmit={submit} submitLabel={t(payable ? "ui.cash.pay" : "ui.cash.collect")} pending={save.pending} error={error ?? save.error}>
      <Text style={[T.small, { marginTop: 4 }]}>{`${t("ui.cash.pendingCol")}: ${fmtMoney(due.pending, due.currency)}`}</Text>
      <SelectField label={t("ui.cash.account")} value={accountId} options={options.map((a) => ({ value: a.id, label: a.name }))} onChange={setAccountId} />
      <TextField label={t("office.cash.amountIn", { currency: due.currency })} value={amount} onChangeText={setAmount} kind="decimal" />
      <DateField label={t("ui.cost.date")} value={date} onChange={setDate} />
    </FormSheet>
  );
}
