/** Cambio de cobertura entre dos fechas (S-31): pedido a demanda, resultado por clase, mapa y PDF. */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coverKeys, parseCoverKey, summarizeCover } from "@yvy/shared";
import { get, post } from "../lib/api";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import type { AnalysisJob, AnalysisPlot, CoverMetrics } from "../lib/types";
import { CoverRequestBar } from "./cover/CoverRequestBar";
import { CoverResult } from "./cover/CoverResult";
import { day, iso } from "./cover/util";
import { EmptyState, ErrorBox, Spinner, toast } from "./ui";

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
  const request = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/cover-change`, { from, to }),
    onSuccess: () => {
      toast(t("ui.cover.requested"));
      void qc.invalidateQueries({ queryKey: ["cover", farmId] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : t("ui.cover.failed")),
  });
  const keys = useMemo(() => coverKeys(q.data?.plots ?? []), [q.data]);
  if (q.isLoading || farm.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data || !farm.data) return null;
  const key = picked && keys.includes(picked) ? picked : keys[0];
  const rows = q.data.plots.filter((p) => p.refKey === key);
  const range = key ? parseCoverKey(key) : null;
  const sum = rows.length ? summarizeCover(rows) : null;
  const canRequest = me.data?.role === "owner" || me.data?.role === "admin";
  const processing = q.data.job.status === "processing";
  const datesOk = from >= "2017-01-01" && Date.parse(to) - Date.parse(from) >= 90 * 86_400_000 && to <= iso(new Date());

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.cover.intro")}</p>
      {canRequest && (
        <CoverRequestBar
          from={from}
          to={to}
          onFrom={setFrom}
          onTo={setTo}
          datesOk={datesOk}
          disabled={!datesOk || processing || request.isPending}
          onCompute={() => request.mutate()}
        />
      )}
      {processing && q.data.job.params && (
        <p className="text-sm text-tinta-2" role="status">
          {t("ui.cover.computing", { from: day(q.data.job.params.from ?? ""), to: day(q.data.job.params.to ?? "") })}
        </p>
      )}
      {q.data.job.status === "failed" && <p className="text-sm text-peligro">{t("ui.cover.failed")}</p>}
      {!sum || !range ? (
        <EmptyState compact>{t("ui.cover.none")}</EmptyState>
      ) : (
        <CoverResult farm={farm.data} me={me.data} rows={rows} sum={sum} range={range} keys={keys} keyValue={key} onPick={setPicked} />
      )}
    </section>
  );
}
