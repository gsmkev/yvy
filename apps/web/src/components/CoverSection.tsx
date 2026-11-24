/** Cambio de cobertura entre dos fechas (S-31): pedido a demanda, resultado por clase, mapa y PDF. */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boundsOf, FarmMap } from "./FarmMap";
import { Button, DataTable, EmptyState, ErrorBox, Field, FilterBar, Input, Select, Spinner, Stat, toast, type Column } from "./ui";
import { get, post } from "../lib/api";
import { analysisAreas, coverKeys, parseCoverKey, summarizeCover } from "@yvy/shared";
import { download } from "../lib/exports";
import { fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import type { AnalysisJob, AnalysisPlot, CoverMetrics } from "../lib/types";

const CLASSES = ["forest", "pasture", "crop", "other"] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function CoverSection({ farmId }: { farmId: string }) {
  const qc = useQueryClient();
  const farm = useFarm(farmId);
  const me = useMe();
  const q = useQuery({
    queryKey: ["cover", farmId],
    queryFn: () => get<{ plots: AnalysisPlot<CoverMetrics>[]; job: AnalysisJob }>(`/org/farms/${farmId}/cover-change`),
    refetchInterval: (x) => (x.state.data?.job.status === "processing" ? 60_000 : false),
  });
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const [from, setFrom] = useState("2020-12-31");
  const [to, setTo] = useState(iso(monthAgo));
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const request = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/cover-change`, { from, to }),
    onSuccess: () => {
      toast(t("ui.coverRequested"));
      void qc.invalidateQueries({ queryKey: ["cover", farmId] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : t("ui.coverFailed")),
  });
  const keys = useMemo(() => coverKeys(q.data?.plots ?? []), [q.data]);
  if (q.isLoading || farm.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data || !farm.data) return null;
  const key = picked && keys.includes(picked) ? picked : keys[0];
  const rows = q.data.plots.filter((p) => p.refKey === key);
  const range = key ? parseCoverKey(key) : null;
  const sum = rows.length ? summarizeCover(rows) : null;
  const f = farm.data.farm;
  const canRequest = me.data?.role === "owner" || me.data?.role === "admin";
  const processing = q.data.job.status === "processing";
  const datesOk = from >= "2017-01-01" && Date.parse(to) - Date.parse(from) >= 90 * 86_400_000 && to <= iso(new Date());
  const day = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("es-PY", { timeZone: "UTC" });

  const pdfFile = async () => {
    if (!range) return;
    setBusy(true);
    setError(null);
    try {
      const [{ pdf }, { CoverReport }] = await Promise.all([import("@react-pdf/renderer"), import("../lib/coverPdf")]);
      const blob = await pdf(<CoverReport farm={f} rows={rows} from={range.from} to={range.to} plots={farm.data.plots} generatedAt={Date.now()} />).toBlob();
      download(blob, `${t("ui.coverPdfFile")}-${f.name}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const classRows = CLASSES.map((c) => ({ c, from: sum?.from[c] ?? 0, to: sum?.to[c] ?? 0 }));
  const cols: Column<(typeof classRows)[number]>[] = range
    ? [
        { id: "class", header: t("ui.coverColClass"), cell: (r) => t(`ui.coverClass_${r.c}`) },
        { id: "from", header: day(range.from), align: "right", cell: (r) => fmtHa(r.from) },
        { id: "to", header: day(range.to), align: "right", cell: (r) => fmtHa(r.to) },
        { id: "diff", header: t("ui.coverColDiff"), align: "right", cell: (r) => `${r.to - r.from > 0 ? "+" : ""}${fmtHa(r.to - r.from)}` },
      ]
    : [];

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.coverIntro")}</p>
      {canRequest && (
        <FilterBar>
          <Field label={t("ui.coverFrom")}>
            <Input type="date" value={from} min="2017-01-01" onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("ui.coverTo")}>
            <Input type="date" value={to} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button variant="secondary" disabled={!datesOk || processing || request.isPending} onClick={() => request.mutate()}>
            {t("ui.coverCompute")}
          </Button>
          {!datesOk && <span className="pb-2.5 text-xs text-tinta-2">{t("ui.coverDatesInvalid")}</span>}
        </FilterBar>
      )}
      {processing && q.data.job.params && (
        <p className="text-sm text-tinta-2" role="status">
          {t("ui.coverComputing", { from: day(q.data.job.params.from ?? ""), to: day(q.data.job.params.to ?? "") })}
        </p>
      )}
      {q.data.job.status === "failed" && <p className="text-sm text-peligro">{t("ui.coverFailed")}</p>}
      {!sum || !range ? (
        <EmptyState compact>{t("ui.coverNone")}</EmptyState>
      ) : (
        <>
          {keys.length > 1 && (
            <div className="max-w-xs">
              <Field label={t("ui.coverPick")}>
                <Select
                  value={key}
                  onChange={(e) => setPicked(e.target.value)}
                  options={keys.map((k) => {
                    const r = parseCoverKey(k);
                    return { value: k, label: r ? t("ui.coverRange", { from: day(r.from), to: day(r.to) }) : k };
                  })}
                />
              </Field>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-tinta-2">{t("ui.coverRange", { from: day(range.from), to: day(range.to) })}</p>
            <Button variant="secondary" onClick={pdfFile} disabled={busy}>
              {busy ? t("ui.coverPdfWorking") : t("ui.coverPdf")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-linea py-5 sm:grid-cols-3">
            <Stat label={t("ui.coverForestFrom", { date: day(range.from) })} value={fmtHa(sum.from.forest)} />
            <Stat label={t("ui.coverForestTo", { date: day(range.to) })} value={fmtHa(sum.to.forest)} />
            {sum.forestLostHa > 0 && <Stat label={t("ui.coverForestLost")} value={fmtHa(sum.forestLostHa)} tone="danger" />}
          </div>
          <div className="grid items-start gap-x-10 gap-y-5 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <DataTable columns={cols} rows={classRows} rowKey={(r) => r.c} caption={t("ui.coverTitle")} />
              <p className="text-sm text-tinta-2">
                {t("ui.coverConversions", { pasture: fmtHa(sum.forestToPasture), crop: fmtHa(sum.forestToCrop), other: fmtHa(sum.forestToOther) })}
              </p>
            </div>
            <div className="h-80 overflow-hidden rounded-lg border border-linea">
              <FarmMap
                outline={f.geometry}
                plots={farm.data.plots}
                problemAreas={analysisAreas(rows)}
                layers={farm.data.layers}
                tilesBaseUrl={me.data?.tilesBaseUrl}
                bounds={boundsOf(f)}
                className="h-full w-full"
              />
            </div>
          </div>
          {error ? <ErrorBox error={error} /> : null}
          <p className="text-sm text-tinta-2">{t("ui.coverDisclaimer")}</p>
          <p className="text-sm text-tinta-2">{t("ui.coverMethod")}</p>
          <p className="text-micro text-tinta-2">{t("attribution.copernicus")}</p>
        </>
      )}
    </section>
  );
}
