/** Caja y bancos por moneda, cuentas a pagar y a cobrar con vencimientos (E-36). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CASH_ACCOUNT_TYPES, CURRENCIES, fromMinor, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtMoney } from "../../lib/money";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Tabs, toast } from "../ui";
import { HeaderActions, RowMenu } from "./adminSlot";
import { MasterPanel, type FieldDef } from "./MasterPanel";
import { useParties } from "./PartiesPanel";
import { ExportableTable } from "../ExportableTable";

interface Account {
  id: string;
  name: string;
  type: (typeof CASH_ACCOUNT_TYPES)[number];
  currency: Currency;
  openingBalance: number;
  balance: number;
}
interface Due {
  docKind: "purchase" | "settlement" | "cattle";
  docId: string;
  partyId: string | null;
  label: string;
  currency: Currency;
  total: number;
  pending: number;
  dueDate: string | null;
  status: "none" | "overdue" | "soon" | "ok";
  daysLeft: number | null;
}
interface Dues {
  rows: Due[];
  totals: Record<string, { pending: number; overdue: number }>;
}

export function CashPanel() {
  const [tab, setTab] = useState("accounts");
  return (
    <div className="flex flex-col gap-4">
      <Tabs<string>
        tabs={[
          { id: "accounts", label: t("ui.cashAccounts") },
          { id: "payables", label: t("ui.cashPayables") },
          { id: "receivables", label: t("ui.cashReceivables") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "accounts" && <Accounts />}
      {tab === "payables" && <DuesTab direction="payables" />}
      {tab === "receivables" && <DuesTab direction="receivables" />}
    </div>
  );
}

const useBalances = () => useQuery({ queryKey: ["erp", "cash-balances"], queryFn: () => get<{ accounts: Account[]; totals: Record<string, number> }>("/org/erp/cash/balances") });

function Accounts() {
  const q = useBalances();
  const [move, setMove] = useState<Account | null>(null);
  const [transferring, setTransferring] = useState(false);
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.cashName"), required: true, maxLength: 80 },
    { key: "type", label: t("ui.cashType"), type: "select", initial: "cash", options: CASH_ACCOUNT_TYPES.map((k) => ({ value: k, label: tk(`ui.cashType_${k}`) })) },
    { key: "currency", label: t("ui.currency"), type: "select", initial: "PYG", options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: "openingBalance", label: t("ui.cashOpening"), type: "money", currencyKey: "currency" },
  ];
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <div className="flex flex-col gap-4">
      {Object.keys(q.data?.totals ?? {}).length > 0 && (
        <div className="flex flex-wrap gap-6">
          {Object.entries(q.data?.totals ?? {}).map(([cur, total]) => (
            <div key={cur}>
              <div className="text-xs text-tinta-2">{t("ui.cashTotal", { currency: cur })}</div>
              <div className="num font-serif text-2xl font-semibold">{fmtMoney(total, cur as Currency)}</div>
            </div>
          ))}
        </div>
      )}
      <MasterPanel<Account>
        path="cash-accounts"
        newLabel={t("ui.cashNew")}
        name={(a) => a.name}
        fields={fields}
        columns={[
          { header: t("ui.cashName"), cell: (a) => <span className="font-medium">{a.name}</span> },
          { header: t("ui.cashType"), cell: (a) => tk(`ui.cashType_${a.type}`) },
          { header: t("ui.currency"), cell: (a) => a.currency },
          {
            header: t("ui.cashBalance"),
            right: true,
            cell: (a) => {
              const bal = q.data?.accounts.find((x) => x.id === a.id)?.balance ?? a.openingBalance;
              return (
                <button className="cursor-pointer underline-offset-4 hover:underline" onClick={() => setMove(q.data?.accounts.find((x) => x.id === a.id) ?? null)}>
                  {fmtMoney(bal, a.currency)}
                </button>
              );
            },
          },
        ]}
      />
      <HeaderActions>
        <Button onClick={() => setTransferring(true)} disabled={(q.data?.accounts.length ?? 0) < 2}>
          {t("ui.cashTransfer")}
        </Button>
      </HeaderActions>
      {move && <MoveModal account={move} onClose={() => setMove(null)} />}
      {transferring && <TransferModal accounts={q.data?.accounts ?? []} onClose={() => setTransferring(false)} />}
    </div>
  );
}

interface Move {
  id: string;
  date: string;
  amount: number;
  description: string | null;
}

/** Movimientos de una cuenta y alta de un ingreso o egreso manual. */
function MoveModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const qc = useQueryClient();
  const moves = useQuery({ queryKey: ["erp", "cash-moves", account.id], queryFn: () => get<Move[]>(`/org/erp/cash/moves?accountId=${account.id}`) });
  const [dir, setDir] = useState("in");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDate(Date.now()));
  const [description, setDescription] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["erp"] });
  const save = useMutation({
    mutationFn: () => post("/org/erp/cash/moves", { accountId: account.id, date, amount: (dir === "in" ? 1 : -1) * toMinor(Number(amount), account.currency), description: description || null }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      setAmount("");
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/org/erp/cash/moves/${id}`), onSuccess: refresh });
  return (
    <Modal title={account.name} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.cashDirection")}>
          <Select value={dir} onChange={(e) => setDir(e.target.value)} options={[{ value: "in", label: t("ui.cashIn") }, { value: "out", label: t("ui.cashOut") }]} />
        </Field>
        <Field label={t("ui.costDate")}>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={`${t("ui.balAmount")} (${account.currency})`}>
          <Input required type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("ui.balNote")}>
          <Input maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
      <ExportableTable name="caja">
        <table className="mt-4 w-full text-sm">
          <tbody>
            {(moves.data ?? []).map((m) => (
              <tr key={m.id} className="border-b border-linea">
                <td className="num py-2 pr-3">{fmtIsoDate(m.date)}</td>
                <td className="py-2 pr-3 text-tinta-2">{m.description}</td>
                <td className={`num py-2 pr-3 text-right ${m.amount < 0 ? "text-peligro" : ""}`}>{fmtMoney(m.amount, account.currency)}</td>
                <td className="py-2 text-right">
                  <RowMenu name={fmtIsoDate(m.date)} onDelete={() => remove.mutate(m.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ExportableTable>
      {(moves.data ?? []).length === 0 && <p className="mt-3 text-sm text-tinta-2">{fromMinor(account.openingBalance, account.currency) === 0 ? t("ui.erpEmpty") : ""}</p>}
    </Modal>
  );
}

function TransferModal({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDate(Date.now()));
  const cur = accounts.find((a) => a.id === from)?.currency ?? "PYG";
  const save = useMutation({
    mutationFn: () => post("/org/erp/cash/transfers", { fromAccountId: from, toAccountId: to, date, amount: toMinor(Number(amount), cur) }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const opts = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }));
  return (
    <Modal title={t("ui.cashTransfer")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.cashFrom")}>
          <Select value={from} onChange={(e) => setFrom(e.target.value)} options={opts} />
        </Field>
        <Field label={t("ui.cashTo")}>
          <Select value={to} onChange={(e) => setTo(e.target.value)} options={opts} />
        </Field>
        <Field label={`${t("ui.balAmount")} (${cur})`}>
          <Input required type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("ui.costDate")}>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const TONE = { overdue: "text-peligro", soon: "text-trigo-texto", ok: "", none: "text-tinta-2" } as const;

function DuesTab({ direction }: { direction: "payables" | "receivables" }) {
  const q = useQuery({ queryKey: ["erp", direction], queryFn: () => get<Dues>(`/org/erp/${direction}`) });
  const parties = useParties();
  const [paying, setPaying] = useState<Due | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";
  const rows = q.data?.rows ?? [];
  return (
    <div className="flex flex-col gap-4">
      {Object.keys(q.data?.totals ?? {}).length > 0 && (
        <div className="flex flex-wrap gap-6">
          {Object.entries(q.data?.totals ?? {}).map(([cur, v]) => (
            <div key={cur}>
              <div className="text-xs text-tinta-2">{t("ui.cashPending", { currency: cur })}</div>
              <div className="num font-serif text-2xl font-semibold">{fmtMoney(v.pending, cur as Currency)}</div>
              {v.overdue > 0 && <div className="num text-sm text-peligro">{t("ui.cashOverdue", { amount: fmtMoney(v.overdue, cur as Currency) })}</div>}
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <ExportableTable name="caja-movimientos">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.docKind}-${r.docId}`} className="border-b border-linea">
                    <td className={`num py-2.5 pr-4 ${TONE[r.status]}`}>{r.dueDate ? fmtIsoDate(r.dueDate) : t("ui.cashNoDue")}</td>
                    <td className="py-2.5 pr-4 font-medium">{r.label}</td>
                    <td className="py-2.5 pr-4 text-tinta-2">{party(r.partyId)}</td>
                    <td className="num py-2.5 pr-4 text-right text-tinta-2">{fmtMoney(r.total, r.currency)}</td>
                    <td className="num py-2.5 pr-4 text-right font-medium">{fmtMoney(r.pending, r.currency)}</td>
                    <td className="py-2.5 text-right">
                      <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-surco hover:underline" onClick={() => setPaying(r)}>
                        {t(direction === "payables" ? "ui.cashPay" : "ui.cashCollect")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      {paying && <SettleModal due={paying} payable={direction === "payables"} onClose={() => setPaying(null)} />}
    </div>
  );
}

function SettleModal({ due, payable, onClose }: { due: Due; payable: boolean; onClose: () => void }) {
  const q = useBalances();
  const qc = useQueryClient();
  const accounts = (q.data?.accounts ?? []).filter((a) => a.currency === due.currency);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(String(fromMinor(due.pending, due.currency)));
  const [date, setDate] = useState(localDate(Date.now()));
  const save = useMutation({
    mutationFn: () => post("/org/erp/cash/settle", { docKind: due.docKind, docId: due.docId, accountId: accountId || accounts[0]?.id, date, amount: toMinor(Number(amount), due.currency) }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={`${t(payable ? "ui.cashPay" : "ui.cashCollect")}: ${due.label}`} onClose={onClose}>
      {q.isLoading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <p className="text-sm text-trigo-texto">{t("ui.cashNoAccount", { currency: due.currency })}</p>
      ) : (
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label={t("ui.cashAccount")}>
            <Select value={accountId || accounts[0]!.id} onChange={(e) => setAccountId(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </Field>
          <Field label={t("ui.costDate")}>
            <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={`${t("ui.balAmount")} (${due.currency})`}>
            <Input required type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {save.error ? (
            <div className="col-span-2">
              <ErrorBox error={save.error} />
            </div>
          ) : null}
          <div className="col-span-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {t("ui.save")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
