/** Exportación al contador: Excel con el libro de movimientos, cuentas a pagar y a cobrar, con el plan de cuentas configurable. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COST_CATEGORIES } from "@yvy/shared";
import { del, get, put, withQs } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { tablesToExcel } from "../../lib/tableExport";
import { Button, ErrorBox, FilterBar, Input, SectionHead, Spinner, toast, DateRange } from "../ui";
import { HeaderActions } from "./adminSlot";
import { accountantSheets, type Export, type MapRow } from "./accountant/accountantSheets";

/** Exportación al contador con el plan de cuentas configurable. */
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
      const d = await get<Export>(
        withQs("/org/erp/accountant/export", { from: from || undefined, to: to || undefined }),
      );
      await tablesToExcel("contador", accountantSheets(d, map.data ?? []));
      if (d.truncated) toast(t("ui.acct.truncated"));
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
          {t("ui.acct.download")}
        </Button>
      </HeaderActions>
      <section className="flex flex-col gap-3">
        <SectionHead title={t("ui.acct.periodTitle")} />
        <FilterBar sheet={false} exportSlot={false}>
          <DateRange
            from={from}
            to={to}
            onChange={(r) => {
              setFrom(r.from);
              setTo(r.to);
            }}
          />
        </FilterBar>
        <p className="text-meta text-tinta-2">{t("ui.acct.periodHint")}</p>
        {error ? <ErrorBox error={error} /> : null}
      </section>
      <section className="flex flex-col gap-3">
        <SectionHead title={t("ui.acct.mapTitle")} />
        <p className="text-sm text-tinta-2">{t("ui.acct.mapIntro")}</p>
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
      toast(t("ui.erp.saved"));
      refresh();
    },
  });
  const reset = useMutation({ mutationFn: () => del(`/org/erp/accountant/map/${row.key}`), onSuccess: refresh });
  const dirty = code !== row.code || name !== row.name;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-2.5 md:grid-cols-[12rem_8rem_minmax(0,1fr)_9rem]">
      <span className="text-sm font-medium">{tk(`ui.cost.category_${row.key}`)}</span>
      <span className="order-last col-span-2 grid grid-cols-[8rem_minmax(0,1fr)] gap-2 md:contents">
        <Input aria-label={t("ui.acct.colCode")} maxLength={30} value={code} onChange={(e) => setCode(e.target.value)} />
        <Input aria-label={t("ui.acct.colAccount")} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </span>
      <span className="flex justify-end gap-1">
        {dirty && (
          <Button size="sm" variant="secondary" disabled={!code.trim() || !name.trim() || save.isPending} onClick={() => save.mutate()}>
            {t("ui.common.save")}
          </Button>
        )}
        {row.custom && (
          <Button size="sm" variant="quiet" onClick={() => reset.mutate()}>
            {t("ui.acct.reset")}
          </Button>
        )}
      </span>
    </div>
  );
}
