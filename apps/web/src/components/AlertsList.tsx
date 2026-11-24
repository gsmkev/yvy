import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { alertShareText } from "@yvy/shared";
import { sortAlerts } from "../lib/alertRank";
import { fmtDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useAlerts } from "../lib/queries";
import { ShareWhatsappButton } from "./ShareButton";
import { Button, EmptyState, ErrorBox, Spinner, toast } from "./ui";

const BAR = { warning: "border-peligro", watch: "border-trigo", info: "border-cielo" } as const;

export function AlertsList({
  farmId,
  farmNames,
  emptyAction,
}: {
  farmId?: string;
  farmNames?: Record<string, string>;
  /** Acción para salir del vacío (por ejemplo, ajustar los umbrales). */
  emptyAction?: ReactNode;
}) {
  const q = useAlerts({ farmId, active: true });
  const qc = useQueryClient();
  const feedback = useMutation({
    mutationFn: ({ id, useful }: { id: string; useful: boolean }) => post(`/org/alerts/${id}/feedback`, { useful }),
    onSuccess: () => {
      toast(t("ui.toast.alertFeedback"));
      return qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
  if (q.isLoading) return <Spinner rows={3} h={104} />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data?.length)
    return (
      <EmptyState title={t("ui.no.alerts")} action={emptyAction}>
        {t("ui.no.alertsHint")}
      </EmptyState>
    );
  return (
    <ul className="divide-y divide-linea border-y border-linea">
      {sortAlerts(q.data).map((a) => {
        const validity = `${fmtDate(a.validFrom)}${a.validTo && a.validTo - a.validFrom > 86_400_000 ? ` – ${fmtDate(a.validTo)}` : ""}`;
        return (
          <li key={a.id} className={`border-l-[3px] py-4 pl-4 ${BAR[a.severity]}`}>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="text-sm font-semibold text-tinta-2">{tk(`ui.alert.kind_${a.kind}`)}</span>
              {a.severity !== "info" && (
                <span className={`text-sm font-medium ${a.severity === "warning" ? "text-peligro" : "text-trigo-texto"}`}>
                  {tk(`ui.severity.${a.severity}`)}
                </span>
              )}
              {farmNames?.[a.farmId] && <span className="text-sm text-tinta-2">{farmNames[a.farmId]}</span>}
              <span className="num ml-auto text-sm text-tinta-2">{validity}</span>
            </div>
            <p className="mt-1.5 text-body leading-6 font-medium text-surco">{a.summary}</p>
            <p className="mt-1 text-xs leading-4 text-tinta-2">
              {a.probability ? `${tk(`ui.probability.${a.probability}`)} · ` : ""}
              {a.plotIds.length} {t("ui.common.plots").toLowerCase()} · {t("ui.common.orientative", { source: a.source })}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <ShareWhatsappButton
                variant="secondary"
                text={alertShareText({
                  kindLabel: tk(`ui.alert.kind_${a.kind}`),
                  severityLabel: tk(`ui.severity.${a.severity}`),
                  summary: a.summary,
                  farmName: farmNames?.[a.farmId],
                  validity,
                  link: `${window.location.origin}/avisos`,
                })}
              />
              {a.useful === null && (
                <span className="flex items-center gap-1 text-sm text-tinta-2">
                  {t("ui.common.useful")}
                  <Button variant="quiet" onClick={() => feedback.mutate({ id: a.id, useful: true })}>
                    {t("ui.common.yes")}
                  </Button>
                  <Button variant="quiet" onClick={() => feedback.mutate({ id: a.id, useful: false })}>
                    {t("ui.common.no")}
                  </Button>
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
