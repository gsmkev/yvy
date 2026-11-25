/** Registros que las reglas simples marcaron como raros. "Está bien" los saca hasta que se editen. */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isFieldRole, type Oddity } from "@yvy/shared";
import { RecordModal } from "../components/RecordsList";
import { Button, EmptyState, ErrorBox, Spinner, toast, Page } from "../components/ui";
import { sortReview } from "../lib/alertRank";
import { get, post } from "../lib/api";
import { describeData } from "../lib/exports";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import type { RecordRow } from "../lib/types";

interface Item {
  recordId: string;
  farmName: string;
  plotName: string | null;
  authorName: string | null;
  kind: string;
  capturedAt: number;
  data: Record<string, unknown>;
  oddities: Oddity[];
  record: RecordRow;
}

const num = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 1 });

/** Por qué se marcó, en una frase. */
function reason(o: Oddity): string {
  switch (o.rule) {
    case "rain_high":
      return t("ui.review.rainHigh", { mm: num(o.mm), max: num(o.max) });
    case "pest_off_season":
      return t("ui.review.pestOff", { pest: tk(`fields.pest.${o.pest}`), month: new Date(2026, o.month - 1, 1).toLocaleDateString("es-PY", { month: "long" }) });
    case "dose_out_of_range": {
      const unit = o.baseUnit === "l" ? "l/ha" : "kg/ha";
      const range = o.min !== null && o.max !== null ? `${num(o.min)} a ${num(o.max)}` : o.min !== null ? `${t("ui.review.atLeast")} ${num(o.min)}` : `${t("ui.review.upTo")} ${num(o.max!)}`;
      return t("ui.review.dose", { product: o.product || "—", dose: num(o.dose), unit: tk(`fields.dose.unit_${o.unit}`), range: `${range} ${unit}` });
    }
    case "yield_impossible":
      return t("ui.review.yield", { tha: num(o.tHa), crop: tk(`fields.crop.${o.crop}`), max: num(o.max) });
  }
}

/** Registros que las reglas simples marcaron como raros. "Está bien" los saca hasta que se editen. */
export function ReviewPage() {
  const me = useMe();
  const qc = useQueryClient();
  const allowed = !!me.data && !isFieldRole(me.data.role);
  const q = useQuery({ enabled: allowed, queryKey: ["review"], queryFn: () => get<Item[]>("/org/review") });
  const [open, setOpen] = useState<RecordRow | null>(null);
  const ok = useMutation({
    mutationFn: (id: string) => post(`/org/review/${id}/ok`),
    onSuccess: () => {
      toast(t("ui.toast.reviewed"));
      return qc.invalidateQueries({ queryKey: ["review"] });
    },
  });
  if (me.data && !allowed) return <div className="p-6">{t("ui.review.notAllowed")}</div>;
  return (
    <Page width="data" back={{ to: "/registros", label: t("ui.nav.records") }} title={t("ui.review.title")}>
      {q.isLoading && <Spinner rows={3} h={96} />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && q.data.length === 0 && (
        <EmptyState
          title={t("ui.review.emptyTitle")}
          action={
            <Link
              to="/registros"
              className="inline-flex h-10 items-center rounded-md border border-linea bg-papel px-3.5 text-sm font-medium text-surco hover:border-tinta-2/40 hover:bg-lino"
            >
              {t("ui.nav.records")}
            </Link>
          }
        >
          {t("ui.review.empty")}
        </EmptyState>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-linea border-y border-linea">
          {sortReview(q.data).map((i) => (
            <li key={i.recordId} className="flex flex-col gap-2 border-l-[3px] border-trigo py-3 pl-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1">
                {i.oddities.map((o, k) => (
                  <p key={k} className="text-sm leading-5 font-medium">
                    {reason(o)}
                  </p>
                ))}
                <button
                  type="button"
                  className="mt-1 block max-w-full cursor-pointer truncate text-left text-sm leading-5 text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
                  onClick={() => setOpen(i.record)}
                >
                  {describeData(i.kind, i.data)}
                </button>
                <p className="text-xs leading-4 text-tinta-2">
                  {[tk(`record-kinds.kind.${i.kind}`), i.farmName, i.plotName, i.authorName, fmtDateTime(i.capturedAt)]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button onClick={() => ok.mutate(i.recordId)} disabled={ok.isPending}>
                  {t("ui.review.ok")}
                </Button>
                <Button variant="quiet" onClick={() => setOpen(i.record)}>
                  {t("ui.review.open")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {ok.error ? <ErrorBox error={ok.error} /> : null}
      {open && <RecordModal record={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}
