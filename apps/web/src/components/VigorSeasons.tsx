/** Vigor de campañas anteriores de un lote, superpuestas (S-03). La historia desde 2017 se pide a demanda por estancia. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CHART } from "@yvy/shared";
import { fmtDate, fmtNdvi } from "../lib/format";
import { t } from "../lib/i18n";
import { get, post } from "../lib/api";
import { useMe } from "../lib/queries";
import { campaignCount, campaignDayLabel, groupCampaigns } from "../lib/vigorSeasons";
import { LineChart } from "./charts";
import { Button, Spinner, toast } from "./ui";

// La campaña actual con el color principal; las anteriores con la paleta de la marca, de la más a la menos reciente.
const COLORS = [CHART.primary, "#D9A93A", "#3B78B8", "#B5562E", "#6B6F63", "#8DB3C7"];

interface History {
  status: "processing" | "done" | "failed" | null;
  requestedAt: number | null;
}

export function VigorSeasons({ plotId, farmId }: { plotId: string; farmId: string }) {
  const qc = useQueryClient();
  const me = useMe();
  const vigor = useQuery({
    queryKey: ["vigor-history", plotId],
    queryFn: () => get<{ series: { acquiredAt: number; mean: number }[] }>(`/org/plots/${plotId}/vigor-history`),
  });
  const status = useQuery({
    queryKey: ["farm-history", farmId],
    queryFn: () => get<History>(`/org/farms/${farmId}/history`),
    // mientras el job corre, se vuelve a mirar cada minuto
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 60_000 : false),
  });
  const request = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/history`),
    onSuccess: () => {
      toast(t("ui.historyRequested"));
      void qc.invalidateQueries({ queryKey: ["farm-history", farmId] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : t("ui.historyFailed")),
  });
  if (vigor.isLoading) return <Spinner />;
  const series = vigor.data?.series ?? [];
  const campaigns = groupCampaigns(series);
  const processing = status.data?.status === "processing";
  const canRequest = me.data?.role === "owner" || me.data?.role === "admin";

  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-1">{t("ui.vigorSeasonsTitle")}</h3>
      {campaignCount(series) >= 2 ? (
        <LineChart
          ariaLabel={t("ui.vigorSeasonsTitle")}
          yLabel="NDVI"
          yDomain={[0, 1]}
          formatX={campaignDayLabel}
          formatY={fmtNdvi}
          series={campaigns.map((c, i) => ({ name: c.label, color: COLORS[i % COLORS.length]!, dashed: i > 0 && i % 2 === 0, points: c.points }))}
        />
      ) : (
        <p className="text-sm text-tinta-2">{t("ui.vigorSeasonsNone")}</p>
      )}
      {processing ? (
        <p className="mt-2 text-xs text-tinta-2" role="status">
          {t("ui.historyProcessing", { date: fmtDate(status.data?.requestedAt ?? Date.now()) })}
        </p>
      ) : (
        canRequest && (
          <div className="mt-2 flex flex-col items-start gap-1">
            <Button variant="secondary" disabled={request.isPending} onClick={() => request.mutate()}>
              {t("ui.historyRequest")}
            </Button>
            <span className="text-[11px] text-tinta-2">
              {status.data?.status === "failed" ? t("ui.historyFailed") : t("ui.historyHint")}
            </span>
          </div>
        )
      )}
      <p className="mt-1 text-[11px] text-tinta-2">{t("attribution.copernicus")}</p>
    </div>
  );
}
