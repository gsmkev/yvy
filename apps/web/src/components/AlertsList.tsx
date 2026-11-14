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
      toast(t("ui.toastAlertFeedback"));
      return qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
  if (q.isLoading) return <Spinner rows={3} h={104} />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data?.length)
    return (
      <EmptyState title={t("ui.noAlerts")} action={emptyAction}>
        {t("ui.noAlertsHint")}
      </EmptyState>
    );
  return (
    <ul className="divide-y divide-linea border-y border-linea">
      {sortAlerts(q.data).map((a) => {
        const validity = `${fmtDate(a.validFrom)}${a.validTo && a.validTo - a.validFrom > 86_400_000 ? ` – ${fmtDate(a.validTo)}` : ""}`;
        return (
          <li key={a.id} className={`border-l-[3px] py-3 pl-3 ${BAR[a.severity]}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[15px] leading-5 font-semibold">{tk(`ui.alertKind_${a.kind}`)}</span>
              {a.severity !== "info" && (
                <span className={`text-sm font-medium ${a.severity === "warning" ? "text-peligro" : "text-trigo-texto"}`}>
                  {tk(`ui.severity_${a.severity}`)}
                </span>
              )}
              {farmNames?.[a.farmId] && <span className="text-sm text-tinta-2">{farmNames[a.farmId]}</span>}
              <span className="num ml-auto text-xs text-tinta-2">{validity}</span>
            </div>
            <p className="mt-1 text-sm leading-5">{a.summary}</p>
            <p className="mt-0.5 text-xs leading-4 text-tinta-2">
              {a.probability ? `${tk(`ui.probability_${a.probability}`)} · ` : ""}
              {a.plotIds.length} {t("ui.plots").toLowerCase()} · {t("ui.orientative", { source: a.source })}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1 text-sm">
              <ShareWhatsappButton
                variant="secondary"
                text={alertShareText({
                  kindLabel: tk(`ui.alertKind_${a.kind}`),
                  severityLabel: tk(`ui.severity_${a.severity}`),
                  summary: a.summary,
                  farmName: farmNames?.[a.farmId],
                  validity,
                  link: `${window.location.origin}/avisos`,
                })}
              />
              {a.useful === null && (
                <span className="ml-auto flex items-center gap-1 text-tinta-2">
                  {t("ui.useful")}
                  <Button variant="quiet" onClick={() => feedback.mutate({ id: a.id, useful: true })}>
                    {t("ui.yes")}
                  </Button>
                  <Button variant="quiet" onClick={() => feedback.mutate({ id: a.id, useful: false })}>
                    {t("ui.no")}
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
