/** Hojas de Caja y bancos: movimientos de una cuenta, alta rápida de un gasto o cobro y pago de una cuenta pendiente. */
import { useState } from "react";
import { View } from "react-native";
import { CASH_ACCOUNT_TYPES, fromMinor, localDate, t, type Currency } from "@yvy/shared";
import type { DueRow as Due } from "@yvy/shared";
import { showToast } from "../../lib/toast";
import { isoShort, parseMinor, useErp, type Party } from "../erpCommon";
import { fmtNumber } from "../format";
import { fmtMoney } from "../money";
import { OnlineState } from "../state";
import { DataList, DateField, FormSheet, Segmented, SelectField, TextField } from "../ui";
import { useOnlineMutation } from "../useOnlineMutation";
import { Sheet, Text } from "../../ui/kit";
import { C, T } from "../../ui/theme";

const INVALIDATE = ["/org/erp/cash", "/org/erp/payables", "/org/erp/receivables"];

/** Cuenta de caja o banco con su saldo. */
export interface Account {
  id: string;
  name: string;
  type: (typeof CASH_ACCOUNT_TYPES)[number];
  currency: Currency;
  openingBalance: number;
  balance: number;
}
/** Cuentas y totales por moneda. */
export interface Balances {
  accounts: Account[];
  totals: Record<string, number>;
}
/** Movimiento de una cuenta. */
export interface Move {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  description: string | null;
}

/** Movimientos de una cuenta. */
export function AccountSheet({ account, onClose }: { account: Account; onClose: () => void }) {
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
export function MoveSheet({ accounts, parties, onClose }: { accounts: Account[]; parties: Party[]; onClose: () => void }) {
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
      <SelectField label={t("ui.cash.account")} value={accountId} options={accounts.map((a) => ({ value: a.id, label: `${a.name}, ${a.currency}` }))} onChange={setAccountId} />
      <TextField label={t("office.cash.concept")} value={description} onChangeText={setDescription} maxLength={200} error={errors.description} />
      <TextField label={t("office.cash.amountIn", { currency: acc?.currency ?? "PYG" })} value={amount} onChangeText={setAmount} kind="decimal" error={errors.amount} placeholder="0" />
      <DateField label={t("ui.cost.date")} value={date} onChange={setDate} error={errors.date} />
      <SelectField label={t("office.cash.party")} value={partyId} placeholder={t("ui.common.none")} options={[{ value: "", label: t("ui.common.none") }, ...parties.map((p) => ({ value: p.id, label: p.name }))]} onChange={setPartyId} />
    </FormSheet>
  );
}

/** Registrar el pago (o el cobro) de una cuenta pendiente. */
export function SettleSheet({ due, accounts, payable, onClose }: { due: Due; accounts: Account[]; payable: boolean; onClose: () => void }) {
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
