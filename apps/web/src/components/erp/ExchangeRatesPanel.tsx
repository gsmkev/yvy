/** Tipo de cambio diario, carga manual: guaraníes por dólar. El más reciente se usa por defecto. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { localDate } from "@yvy/shared";
import { del, get, put } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, Form, Input, SectionHead, Spinner, Stat, toast } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { RowMenu } from "./adminSlot";

interface Rate {
  date: string;
  usdToPyg: number;
}

/** Tipos de cambio cargados. */
export const useRates = () => useQuery({ queryKey: ["erp", "exchange-rates"], queryFn: () => get<Rate[]>("/org/erp/exchange-rates") });

/** Carga manual del tipo de cambio diario y su historial. */
export function ExchangeRatesPanel() {
  const q = useRates();
  const qc = useQueryClient();
  const [date, setDate] = useState(() => localDate(Date.now()));
  const [value, setValue] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["erp"] });
  const save = useMutation({
    mutationFn: () => put(`/org/erp/exchange-rates/${date}`, { usdToPyg: Math.round(Number(value)) }),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      setValue("");
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (d: string) => del(`/org/erp/exchange-rates/${d}`), onSuccess: refresh });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rates = q.data ?? [];
  const latest = rates[0];
  const cols: Column<Rate>[] = [
    { id: "date", header: t("ui.rates.date"), cell: (r) => fmtIsoDate(r.date) },
    { id: "value", header: t("ui.rates.value"), align: "right", cell: (r) => fmtGs(r.usdToPyg) },
    { id: "_a", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (r) => <RowMenu name={fmtIsoDate(r.date)} onDelete={() => remove.mutate(r.date)} /> },
  ];
  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <aside className="flex flex-col gap-3 lg:col-start-2 lg:row-start-1">
        <SectionHead title={t("ui.rates.loadTitle")} />
        <Form className="flex flex-col gap-3" onSubmit={() => save.mutate()}>
          <Field label={t("ui.rates.date")}>
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("ui.rates.value")}>
            <Input type="number" required min={1} step="1" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {t("ui.common.save")}
            </Button>
          </div>
        </Form>
        {save.error ? <ErrorBox error={save.error} /> : null}
      </aside>
      <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
        {latest && <Stat size="lg" label={t("ui.rates.current")} value={fmtGs(latest.usdToPyg)} note={t("ui.rates.currentNote", { date: fmtIsoDate(latest.date) })} />}
        {rates.length === 0 ? (
          <EmptyState title={t("ui.rates.noneTitle")}>{t("ui.rates.emptyHint")}</EmptyState>
        ) : (
          <ExportableTable name="tipos-de-cambio">
            <DataTable columns={cols} rows={rates} rowKey={(r) => r.date} caption={t("ui.admin.section_rates")} />
          </ExportableTable>
        )}
      </div>
    </div>
  );
}
