/** Exportación al contador: Excel con el libro de movimientos, cuentas a pagar y a cobrar, con el plan de cuentas configurable (E-38). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COST_CATEGORIES, type CostCategory } from "@yvy/shared";
import { del, get, put, qs } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { tablesToExcel } from "../../lib/tableExport";
import { Button, ErrorBox, Field, FilterBar, Input, SectionHead, Spinner, toast } from "../ui";
import { HeaderActions } from "./adminSlot";

interface MapRow {
  key: CostCategory;
  code: string;
  name: string;
  custom: boolean;
}
interface Ledger {
  date: string;
  type: "income" | "cost";
  accountCode: string;
  accountName: string;
  description: string;
  party: string;
  ruc: string;
  farm: string;
  activity: string;
  currency: string;
  amount: number;
  amountPyg: number;
  origin: string;
}
interface Due {
  label: string;
  party: string;
  ruc: string;
  currency: string;
  total: number;
  pending: number;
  dueDate: string | null;
}
interface Export {
  truncated: boolean;
  ledger: Ledger[];
  payables: Due[];
  receivables: Due[];
}

/** Monto en unidad menor a lo que se lee en una planilla: guaraníes enteros, dólares con dos decimales. */
const major = (minor: number, currency: string) => (currency === "USD" ? minor / 100 : minor);

export function AccountantPanel() {
  const map = useQuery({ queryKey: ["erp", "account-map"], queryFn: () => get<MapRow[]>("/org/erp/accountant/map") });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await get<Export>(`/org/erp/accountant/export${qs({ from: from || undefined, to: to || undefined })}`);
      const dueTable = (name: string, rows: Due[]) => ({
        name,
        headers: [t("ui.acctColParty"), t("ui.acctColRuc"), t("ui.acctColDoc"), t("ui.acctColCurrency"), t("ui.acctColTotal"), t("ui.acctColPending"), t("ui.acctColDue")],
        rows: rows.map((r) => [r.party, r.ruc, r.label, r.currency, major(r.total, r.currency), major(r.pending, r.currency), r.dueDate ?? ""]),
      });
      await tablesToExcel("contador", [
        {
          name: t("ui.acctSheetLedger"),
          headers: [
            t("ui.costDate"),
            t("ui.acctColType"),
            t("ui.acctColCode"),
            t("ui.acctColAccount"),
            t("ui.acctColDescription"),
            t("ui.acctColParty"),
            t("ui.acctColRuc"),
            t("ui.costFarm"),
            t("ui.costActivity"),
            t("ui.acctColCurrency"),
            t("ui.acctColAmount"),
            t("ui.acctColAmountPyg"),
          ],
          rows: d.ledger.map((r) => [r.date, t(r.type === "income" ? "ui.acctIncome" : "ui.acctCost"), r.accountCode, r.accountName, r.description, r.party, r.ruc, r.farm, tk(`ui.activity_${r.activity}`), r.currency, major(r.amount, r.currency), r.amountPyg]),
        },
        dueTable(t("ui.acctSheetPayables"), d.payables),
        dueTable(t("ui.acctSheetReceivables"), d.receivables),
        {
          name: t("ui.acctSheetMap"),
          headers: [t("ui.costCategory"), t("ui.acctColCode"), t("ui.acctColAccount")],
          rows: (map.data ?? []).map((m) => [tk(`ui.costCategory_${m.key}`), m.code, m.name]),
        },
      ]);
      if (d.truncated) toast(t("ui.acctTruncated"));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  if (map.isLoading) return <Spinner />;
  if (map.error) return <ErrorBox error={map.error} />;
  return (
    <div className="flex flex-col gap-8">
      <HeaderActions>
        <Button variant="primary" disabled={busy} onClick={download}>
          {t("ui.acctDownload")}
        </Button>
      </HeaderActions>
      <section className="flex flex-col gap-3">
        <SectionHead title={t("ui.acctPeriodTitle")} />
        <FilterBar>
          <Field label={t("ui.acctFrom")}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("ui.acctTo")}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </FilterBar>
        <p className="text-meta text-tinta-2">{t("ui.acctPeriodHint")}</p>
        {error ? <ErrorBox error={error} /> : null}
      </section>
      <section className="flex flex-col gap-3">
        <SectionHead title={t("ui.acctMapTitle")} />
        <p className="text-sm text-tinta-2">{t("ui.acctMapIntro")}</p>
        <div className="divide-y divide-linea border-y border-linea">
          {COST_CATEGORIES.map((k) => {
            const row = map.data?.find((m) => m.key === k);
            return row ? <MapLine key={`${k}-${row.code}-${row.name}`} row={row} /> : null;
          })}
        </div>
      </section>
    </div>
  );
}

function MapLine({ row }: { row: MapRow }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(row.code);
  const [name, setName] = useState(row.name);
  const refresh = () => qc.invalidateQueries({ queryKey: ["erp", "account-map"] });
  const save = useMutation({
    mutationFn: () => put(`/org/erp/accountant/map/${row.key}`, { code, name }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      refresh();
    },
  });
  const reset = useMutation({ mutationFn: () => del(`/org/erp/accountant/map/${row.key}`), onSuccess: refresh });
  const dirty = code !== row.code || name !== row.name;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-2.5 md:grid-cols-[12rem_8rem_minmax(0,1fr)_9rem]">
      <span className="text-sm font-medium">{tk(`ui.costCategory_${row.key}`)}</span>
      <span className="order-last col-span-2 grid grid-cols-[8rem_minmax(0,1fr)] gap-2 md:contents">
        <Input aria-label={t("ui.acctColCode")} maxLength={30} value={code} onChange={(e) => setCode(e.target.value)} />
        <Input aria-label={t("ui.acctColAccount")} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </span>
      <span className="flex justify-end gap-1">
        {dirty && (
          <Button size="sm" variant="secondary" disabled={!code.trim() || !name.trim() || save.isPending} onClick={() => save.mutate()}>
            {t("ui.save")}
          </Button>
        )}
        {row.custom && (
          <Button size="sm" variant="quiet" onClick={() => reset.mutate()}>
            {t("ui.acctReset")}
          </Button>
        )}
      </span>
    </div>
  );
}
