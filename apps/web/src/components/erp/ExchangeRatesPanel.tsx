/** Tipo de cambio diario, carga manual (E-06): guaraníes por dólar. El más reciente se usa por defecto. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { localDate } from "@yvy/shared";
import { del, get, put } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, Empty, ErrorBox, Field, Input, Spinner, toast } from "../ui";

interface Rate {
  date: string;
  usdToPyg: number;
}

export const useRates = () => useQuery({ queryKey: ["erp", "exchange-rates"], queryFn: () => get<Rate[]>("/org/erp/exchange-rates") });

export function ExchangeRatesPanel() {
  const q = useRates();
  const qc = useQueryClient();
  const [date, setDate] = useState(() => localDate(Date.now()));
  const [value, setValue] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["erp"] });
  const save = useMutation({
    mutationFn: () => put(`/org/erp/exchange-rates/${date}`, { usdToPyg: Math.round(Number(value)) }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      setValue("");
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (d: string) => del(`/org/erp/exchange-rates/${d}`), onSuccess: refresh });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rates = q.data ?? [];
  const latest = rates[0];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.ratesIntro")}</p>
      <div className="flex flex-col gap-0.5">
        <span className="eyebrow">{t("ui.ratesCurrent")}</span>
        {latest ? (
          <>
            <span className="num font-serif text-[28px] leading-tight font-semibold">{fmtGs(latest.usdToPyg)}</span>
            <span className="text-xs text-tinta-2">{t("ui.ratesCurrentNote", { date: fmtIsoDate(latest.date) })}</span>
          </>
        ) : (
          <span className="text-sm text-tinta-2">{t("ui.ratesNone")}</span>
        )}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.ratesDate")}>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.ratesValue")}>
          <Input type="number" required min={1} step="1" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={save.isPending || !value}>
          {t("ui.save")}
        </Button>
      </form>
      {save.error ? <ErrorBox error={save.error} /> : null}
      {rates.length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <table className="w-full max-w-lg text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-tinta-2">
              <th className="py-2 pr-4 font-medium">{t("ui.ratesDate")}</th>
              <th className="py-2 pr-4 text-right font-medium">{t("ui.ratesValue")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.date} className="border-b border-linea">
                <td className="num py-2.5 pr-4">{fmtIsoDate(r.date)}</td>
                <td className="num py-2.5 pr-4 text-right">{fmtGs(r.usdToPyg)}</td>
                <td className="py-2.5 text-right">
                  <button
                    className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline"
                    onClick={() => remove.mutate(r.date)}
                  >
                    {t("ui.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
