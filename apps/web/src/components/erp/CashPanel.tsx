/** Caja y bancos por moneda, cuentas a pagar y a cobrar con vencimientos (E-36). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CASH_ACCOUNT_TYPES, CURRENCIES, fromMinor, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtMoney } from "../../lib/money";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, Form, FormFooter, Input, Modal, Select, Spinner, Stat, Tabs, toast } from "../ui";
import { HeaderActions, RowMenu } from "./adminSlot";
import { type FieldDef } from "./MasterPanel";
import { RecordList } from "./RecordList";
import { SectionButton } from "./SectionButton";
import { useParties } from "./PartiesPanel";
import { ExportableTable } from "../ExportableTable";
import type { DueRow as Due, DuesResponse as Dues } from "@yvy/shared";

interface Account {
  id: string;
  name: string;
  type: (typeof CASH_ACCOUNT_TYPES)[number];
  currency: Currency;
  openingBalance: number;
  balance: number;
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
  const accounts = q.data?.accounts ?? [];
  return (
    <div className="flex flex-col gap-4">
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          {Object.entries(q.data?.totals ?? {}).map(([cur, total]) => (
            <Stat key={cur} label={t("ui.cashTotal", { currency: cur })} value={fmtMoney(total, cur as Currency)} />
          ))}
        </div>
      )}
      <RecordList<Account>
        path="cash-accounts"
        exportName="cuentas"
        newLabel={t("ui.cashNew")}
        emptyTitle={t("ui.cashEmptyTitle")}
        emptyHint={t("ui.cashEmptyHint")}
        name={(a) => a.name}
        fields={fields}
        columns={[
          { header: t("ui.cashName"), cell: (a) => a.name },
          { header: t("ui.cashType"), hideBelow: "sm", cell: (a) => tk(`ui.cashType_${a.type}`) },
          { header: t("ui.currency"), hideBelow: "sm", cell: (a) => a.currency },
          {
            header: t("ui.cashBalance"),
            right: true,
            cell: (a) => {
              const bal = accounts.find((x) => x.id === a.id)?.balance ?? a.openingBalance;
              return (
                <button className="cursor-pointer underline-offset-4 hover:underline" onClick={() => setMove(accounts.find((x) => x.id === a.id) ?? null)}>
                  {fmtMoney(bal, a.currency)}
                </button>
              );
            },
          },
        ]}
      />
      {accounts.length >= 2 && (
        <HeaderActions>
          <Button onClick={() => setTransferring(true)}>{t("ui.cashTransfer")}</Button>
        </HeaderActions>
      )}
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
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
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
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
      {(moves.data ?? []).length > 0 ? (
        <div className="mt-4">
          <ExportableTable name="caja">
            <DataTable
              columns={[
                { id: "date", header: t("ui.costDate"), cell: (m: Move) => fmtIsoDate(m.date) },
                { id: "desc", header: t("ui.balNote"), hideBelow: "sm", cell: (m: Move) => <span className="text-tinta-2">{m.description}</span> },
                { id: "amount", header: t("ui.balAmount"), align: "right", cell: (m: Move) => <span className={m.amount < 0 ? "text-peligro" : ""}>{fmtMoney(m.amount, account.currency)}</span> },
                { id: "_a", header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>, align: "right", width: "3rem", cell: (m: Move) => <RowMenu name={fmtIsoDate(m.date)} onDelete={() => remove.mutate(m.id)} /> },
              ]}
              rows={moves.data ?? []}
              rowKey={(m) => m.id}
            />
          </ExportableTable>
        </div>
      ) : (
        <p className="mt-3 text-sm text-tinta-2">{t("ui.cashNoMoves")}</p>
      )}
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
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
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
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
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
  const payable = direction === "payables";
  const cols: Column<Due>[] = [
    { id: "due", header: t("ui.cashDue"), cell: (r) => <span className={`whitespace-nowrap ${TONE[r.status]}`}>{r.dueDate ? fmtIsoDate(r.dueDate) : t("ui.cashNoDue")}</span> },
    {
      id: "label",
      header: t("ui.cashDoc"),
      cell: (r) => (
        <>
          {r.label}
          {party(r.partyId) && <span className="block text-meta font-normal text-tinta-2 md:hidden">{party(r.partyId)}</span>}
        </>
      ),
    },
    { id: "party", header: payable ? t("ui.cashSupplier") : t("ui.cashClient"), hideBelow: "md", cell: (r) => <span className="text-tinta-2">{party(r.partyId)}</span> },
    { id: "total", header: t("ui.cashTotalCol"), align: "right", hideBelow: "lg", cell: (r) => <span className="text-tinta-2">{fmtMoney(r.total, r.currency)}</span> },
    { id: "pending", header: t("ui.cashPendingCol"), align: "right", cell: (r) => <span className="font-medium">{fmtMoney(r.pending, r.currency)}</span> },
    {
      id: "_a",
      header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>,
      align: "right",
      cell: (r) => (
        <Button variant="quiet" size="sm" onClick={() => setPaying(r)}>
          {t(payable ? "ui.cashPay" : "ui.cashCollect")}
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          {Object.entries(q.data?.totals ?? {}).map(([cur, v]) => (
            <Stat
              key={cur}
              label={t("ui.cashPending", { currency: cur })}
              value={fmtMoney(v.pending, cur as Currency)}
              note={v.overdue > 0 ? <span className="text-peligro">{t("ui.cashOverdue", { amount: fmtMoney(v.overdue, cur as Currency) })}</span> : undefined}
            />
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState
          title={payable ? t("ui.cashPayablesEmptyTitle") : t("ui.cashReceivablesEmptyTitle")}
          action={<SectionButton to={payable ? "purchases" : "grain"}>{payable ? t("ui.cashGoPurchases") : t("ui.cashGoSales")}</SectionButton>}
        >
          {payable ? t("ui.cashPayablesEmptyHint") : t("ui.cashReceivablesEmptyHint")}
        </EmptyState>
      ) : (
        <ExportableTable name={payable ? "a-pagar" : "a-cobrar"}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => `${r.docKind}-${r.docId}`} caption={payable ? t("ui.cashPayables") : t("ui.cashReceivables")} />
        </ExportableTable>
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
        <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
          <Field label={t("ui.cashAccount")}>
            <Select value={accountId || accounts[0]!.id} onChange={(e) => setAccountId(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </Field>
          <Field label={t("ui.costDate")}>
            <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={`${t("ui.balAmount")} (${due.currency})`}>
            <Input required type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <FormFooter error={save.error} disabled={save.isPending} />
        </Form>
      )}
    </Modal>
  );
}
