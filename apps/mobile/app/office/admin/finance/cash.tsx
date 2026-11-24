/**
 * Caja y bancos (función 128): cuentas con saldo, movimientos recientes, por pagar y por cobrar. Alta rápida de un
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
  if (!allowed) return <NoAdminAccess title={t("ui.adminSection_cash")} />;

  const accounts = balances.data?.accounts ?? [];
  const partyName = (id: string | null) => parties.data?.find((p) => p.id === id)?.name;
  const accName = (id: string) => accounts.find((a) => a.id === id);
  const dueQuery = tab === "payables" ? payables : receivables;
  const query = tab === "accounts" ? balances : dueQuery;

  return (
    <OfficeScreen
      title={t("ui.adminSection_cash")}
      query={query}
      onRefresh={async () => {
        await Promise.all([balances.refresh(), moves.refresh(), tab === "accounts" ? undefined : dueQuery.refresh()]);
      }}
      action={accounts.length > 0 ? { label: t("office.cashAddMove"), icon: Plus, onPress: () => setAdding(true), disabled: !!noSignal } : undefined}
      footer={accounts.length > 0 ? <NoSignalNote /> : undefined}
    >
      <View style={{ marginTop: 16 }}>
        <Segmented<Tab>
          options={[
            { value: "accounts", label: t("ui.cashAccounts") },
            { value: "payables", label: t("ui.cashPayables") },
            { value: "receivables", label: t("ui.cashReceivables") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === "accounts" ? (
        <OnlineState query={balances} empty={{ title: t("ui.cashEmptyTitle"), hint: t("office.cashEmptyHintApp") }} isEmpty={(d) => d.accounts.length === 0}>
          {(d) => (
            <>
              <MoneyStats items={Object.entries(d.totals).map(([cur, total]) => ({ label: t("ui.cashTotal", { currency: cur }), value: fmtMoney(total, cur as Currency), tone: total < 0 ? ("danger" as const) : undefined }))} />
              <SectionHeader title={t("ui.cashAccounts")} />
              <DataList
                rows={d.accounts}
                keyOf={(a) => a.id}
                title={(a) => a.name}
                subtitle={(a) => `${t(key(`ui.cashType_${a.type}`))} · ${a.currency}`}
                right={(a) => <Text style={[T.bodyMedium, a.balance < 0 && { color: C.peligro }]}>{fmtMoney(a.balance, a.currency)}</Text>}
                onPress={setAccount}
                empty={{ title: t("ui.cashEmptyTitle") }}
              />
              {(moves.data ?? []).length > 0 ? (
                <>
                  <SectionHeader title={t("office.cashRecentMoves")} />
                  <DataList
                    rows={(moves.data ?? []).slice(0, 8)}
                    keyOf={(m) => m.id}
                    title={(m) => m.description || (m.amount < 0 ? t("ui.cashOut") : t("ui.cashIn"))}
                    subtitle={(m) => `${isoShort(m.date)} · ${accName(m.accountId)?.name ?? ""}`}
                    right={(m) => <Text style={[T.bodyMedium, m.amount < 0 && { color: C.peligro }]}>{fmtMoney(m.amount, accName(m.accountId)?.currency ?? "PYG")}</Text>}
                    empty={{ title: t("ui.cashNoMoves") }}
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
          empty={tab === "payables" ? { title: t("ui.cashPayablesEmptyTitle"), hint: t("ui.cashPayablesEmptyHint") } : { title: t("ui.cashReceivablesEmptyTitle"), hint: t("ui.cashReceivablesEmptyHint") }}
        >
          {(d) => (
            <>
              <MoneyStats
                items={Object.entries(d.totals).flatMap(([cur, v]) => [
                  { label: t("ui.cashPending", { currency: cur }), value: fmtMoney(v.pending, cur as Currency) },
                  ...(v.overdue > 0 ? [{ label: t("office.cashOverdueLabel", { currency: cur }), value: fmtMoney(v.overdue, cur as Currency), tone: "danger" as const }] : []),
                ])}
              />
              <SectionHeader title={tab === "payables" ? t("ui.cashPayables") : t("ui.cashReceivables")} />
              <DataList
                rows={d.rows}
                keyOf={(r) => `${r.docKind}-${r.docId}`}
                title={(r) => r.label}
                subtitle={(r) => [partyName(r.partyId), r.dueDate ? `${t("ui.cashDue")} ${isoShort(r.dueDate)}` : t("ui.cashNoDue")].filter(Boolean).join(" · ")}
                right={(r) => <Text style={[T.bodyMedium, r.status === "overdue" && { color: C.peligro }]}>{fmtMoney(r.pending, r.currency)}</Text>}
                onPress={setPaying}
                empty={{ title: t("ui.erpEmpty") }}
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
      <Text style={T.small}>{`${t("ui.cashBalance")}: ${fmtMoney(account.balance, account.currency)}`}</Text>
      <OnlineState query={q} skeletonRows={3} empty={{ title: t("ui.cashNoMoves") }} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <DataList
            rows={rows.slice(0, 30)}
            keyOf={(m) => m.id}
            title={(m) => m.description || (m.amount < 0 ? t("ui.cashOut") : t("ui.cashIn"))}
            subtitle={(m) => isoShort(m.date)}
            right={(m) => <Text style={[T.bodyMedium, m.amount < 0 && { color: C.peligro }]}>{fmtMoney(m.amount, account.currency)}</Text>}
            empty={{ title: t("ui.cashNoMoves") }}
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
    if (minor === null) e.amount = t("office.moneyNeedsAmount");
    if (!date) e.date = t("office.invalidDate");
    if (!description.trim()) e.description = t("office.cashNeedsConcept");
    setErrors(e);
    if (Object.keys(e).length || minor === null) return;
    const r = await save.mutate({ accountId, date, amount: dir === "out" ? -minor : minor, description: description.trim(), partyId: partyId || null });
    if (r.ok) {
      showToast(t("ui.erpSaved"));
      onClose();
    }
  };
  return (
    <FormSheet visible title={t("office.cashAddMove")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.save")} pending={save.pending} error={save.error}>
      <View style={{ marginTop: 8 }}>
        <Segmented
          options={[
            { value: "out", label: t("office.cashExpense") },
            { value: "in", label: t("office.cashIncome") },
          ]}
          value={dir}
          onChange={setDir}
        />
      </View>
      <SelectField label={t("ui.cashAccount")} value={accountId} options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))} onChange={setAccountId} />
      <TextField label={t("office.cashConcept")} value={description} onChangeText={setDescription} maxLength={200} error={errors.description} />
      <TextField label={t("office.cashAmountIn", { currency: acc?.currency ?? "PYG" })} value={amount} onChangeText={setAmount} kind="decimal" error={errors.amount} placeholder="0" />
      <DateField label={t("ui.costDate")} value={date} onChange={setDate} error={errors.date} />
      <SelectField label={t("office.cashParty")} value={partyId} placeholder={t("ui.none")} options={[{ value: "", label: t("ui.none") }, ...parties.map((p) => ({ value: p.id, label: p.name }))]} onChange={setPartyId} />
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
  const title = `${t(payable ? "ui.cashPay" : "ui.cashCollect")}: ${due.label}`;
  const submit = async () => {
    const minor = parseMinor(amount, due.currency);
    if (minor === null) return setError(t("office.moneyNeedsAmount"));
    if (minor > due.pending) return setError(t("office.cashOverSettle"));
    if (!date) return setError(t("office.invalidDate"));
    setError(null);
    const r = await save.mutate({ docKind: due.docKind, docId: due.docId, accountId, date, amount: minor });
    if (r.ok) {
      showToast(t("ui.erpSaved"));
      onClose();
    }
  };
  if (options.length === 0)
    return (
      <Sheet visible title={title} onClose={onClose}>
        <Text style={T.body}>{t("ui.cashNoAccount", { currency: due.currency })}</Text>
      </Sheet>
    );
  return (
    <FormSheet visible title={title} onClose={onClose} onSubmit={submit} submitLabel={t(payable ? "ui.cashPay" : "ui.cashCollect")} pending={save.pending} error={error ?? save.error}>
      <Text style={[T.small, { marginTop: 4 }]}>{`${t("ui.cashPendingCol")}: ${fmtMoney(due.pending, due.currency)}`}</Text>
      <SelectField label={t("ui.cashAccount")} value={accountId} options={options.map((a) => ({ value: a.id, label: a.name }))} onChange={setAccountId} />
      <TextField label={t("office.cashAmountIn", { currency: due.currency })} value={amount} onChangeText={setAmount} kind="decimal" />
      <DateField label={t("ui.costDate")} value={date} onChange={setDate} />
    </FormSheet>
  );
}
