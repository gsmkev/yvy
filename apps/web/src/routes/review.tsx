import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { RecordModal } from "../components/RecordsList";
import { Button, Empty, ErrorBox, Spinner } from "../components/ui";
import { get, post } from "../lib/api";
import { describeData } from "../lib/exports";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import type { RecordRow } from "../lib/types";

type Oddity =
  | { rule: "rain_high"; mm: number; max: number }
  | { rule: "pest_off_season"; pest: string; month: number }
  | { rule: "dose_out_of_range"; product: string; dose: number; unit: string; min: number | null; max: number | null; baseUnit: "l" | "kg" }
  | { rule: "yield_impossible"; tHa: number; max: number; crop: string };

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
      return t("ui.reviewRainHigh", { mm: num(o.mm), max: num(o.max) });
    case "pest_off_season":
      return t("ui.reviewPestOff", { pest: tk(`fields.pest_${o.pest}`), month: new Date(2026, o.month - 1, 1).toLocaleDateString("es-PY", { month: "long" }) });
    case "dose_out_of_range": {
      const unit = o.baseUnit === "l" ? "l/ha" : "kg/ha";
      const range = o.min !== null && o.max !== null ? `${num(o.min)} a ${num(o.max)}` : o.min !== null ? `${t("ui.reviewAtLeast")} ${num(o.min)}` : `${t("ui.reviewUpTo")} ${num(o.max!)}`;
      return t("ui.reviewDose", { product: o.product || "—", dose: num(o.dose), unit: tk(`fields.doseUnit_${o.unit}`), range: `${range} ${unit}` });
    }
    case "yield_impossible":
      return t("ui.reviewYield", { tha: num(o.tHa), crop: tk(`fields.crop_${o.crop}`), max: num(o.max) });
  }
}

/** X-26: registros que las reglas simples marcaron como raros. "Está bien" los saca hasta que se editen. */
export function ReviewPage() {
  const me = useMe();
  const qc = useQueryClient();
  const allowed = !!me.data && !isFieldRole(me.data.role);
  const q = useQuery({ enabled: allowed, queryKey: ["review"], queryFn: () => get<Item[]>("/org/review") });
  const [open, setOpen] = useState<RecordRow | null>(null);
  const ok = useMutation({
    mutationFn: (id: string) => post(`/org/review/${id}/ok`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review"] }),
  });
  if (me.data && !allowed) return <div className="p-6">{t("ui.reviewNotAllowed")}</div>;
  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <Link to="/registros" className="text-sm text-accion underline underline-offset-4">
        {t("ui.navRecords")}
      </Link>
      <h1 className="mt-2 text-[28px] leading-tight">{t("ui.reviewTitle")}</h1>
      <p className="mt-2 text-tinta-2">{t("ui.reviewIntro")}</p>
      {q.isLoading && <Spinner rows={4} h={72} />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && q.data.length === 0 && <Empty title={t("ui.reviewEmptyTitle")}>{t("ui.reviewEmpty")}</Empty>}
      {q.data && q.data.length > 0 && (
        <ul className="mt-4 divide-y divide-linea border-y border-linea">
          {q.data.map((i) => (
            <li key={i.recordId} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <button type="button" className="cursor-pointer text-left font-medium underline-offset-4 hover:underline" onClick={() => setOpen(i.record)}>
                  {describeData(i.kind, i.data)}
                </button>
                <span className="num text-xs text-tinta-2">{fmtDateTime(i.capturedAt)}</span>
              </div>
              <p className="mt-0.5 text-sm text-tinta-2">
                {[tk(`recordKinds.${i.kind}`), i.farmName, i.plotName, i.authorName].filter(Boolean).join(" · ")}
              </p>
              <ul className="mt-2 border-l-2 border-trigo pl-3 text-sm">
                {i.oddities.map((o, k) => (
                  <li key={k}>{reason(o)}</li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => ok.mutate(i.recordId)} disabled={ok.isPending}>
                  {t("ui.reviewOk")}
                </Button>
                <Button variant="quiet" onClick={() => setOpen(i.record)}>
                  {t("ui.reviewOpen")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {ok.error ? <ErrorBox error={ok.error} /> : null}
      {open && <RecordModal record={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
