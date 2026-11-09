import { useMutation, useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useAlerts } from "../lib/queries";
import { Button, Card, Empty, ErrorBox, SeverityBadge, Spinner } from "./ui";

export function AlertsList({ farmId, farmNames }: { farmId?: string; farmNames?: Record<string, string> }) {
  const q = useAlerts({ farmId, active: true });
  const qc = useQueryClient();
  const feedback = useMutation({
    mutationFn: ({ id, useful }: { id: string; useful: boolean }) => post(`/org/alerts/${id}/feedback`, { useful }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data?.length) return <Empty>{t("ui.noAlerts")}</Empty>;
  return (
    <div className="flex flex-col gap-3">
      {q.data.map((a) => (
        <Card key={a.id} className={a.severity === "warning" ? "ring-2 ring-alerta/40" : ""}>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={a.severity} />
            <span className="font-semibold">{tk(`ui.alertKind_${a.kind}`)}</span>
            {farmNames?.[a.farmId] && <span className="text-sm text-surco/60">· {farmNames[a.farmId]}</span>}
            <span className="ml-auto text-xs text-surco/60">
              {fmtDate(a.validFrom)}
              {a.validTo && a.validTo - a.validFrom > 86_400_000 ? ` – ${fmtDate(a.validTo)}` : ""}
            </span>
          </div>
          <p className="mt-2 text-sm">{a.summary}</p>
          <p className="mt-1 text-xs text-surco/60">
            {a.probability ? `${tk(`ui.probability_${a.probability}`)} · ` : ""}
            {t("ui.orientative", { source: a.source })} · {a.plotIds.length} {t("ui.plots").toLowerCase()}
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            {a.useful === null ? (
              <>
                <span className="text-surco/70">{t("ui.useful")}</span>
                <Button variant="ghost" onClick={() => feedback.mutate({ id: a.id, useful: true })}>
                  👍 {t("ui.yes")}
                </Button>
                <Button variant="ghost" onClick={() => feedback.mutate({ id: a.id, useful: false })}>
                  👎 {t("ui.no")}
                </Button>
              </>
            ) : (
              <span className="text-surco/60">{t("ui.thanks")}</span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
