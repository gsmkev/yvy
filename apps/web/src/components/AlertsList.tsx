import { useMutation, useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { alertShareText } from "@yvy/shared";
import { fmtDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useAlerts } from "../lib/queries";
import { AlertTriangle, Check, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { ALERT_ICON } from "../lib/icons";
import { ShareWhatsappButton } from "./ShareButton";
import { Button, Empty, ErrorBox, SeverityBadge, Spinner } from "./ui";

export function AlertsList({ farmId, farmNames }: { farmId?: string; farmNames?: Record<string, string> }) {
  const q = useAlerts({ farmId, active: true });
  const qc = useQueryClient();
  const feedback = useMutation({
    mutationFn: ({ id, useful }: { id: string; useful: boolean }) => post(`/org/alerts/${id}/feedback`, { useful }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data?.length) return <Empty icon={ShieldCheck} title={t("ui.noAlerts")} />;
  return (
    <ul className="flex flex-col gap-3">
      {q.data.map((a) => {
        const Icon = ALERT_ICON[a.kind] ?? AlertTriangle;
        return (
          <li
            key={a.id}
            className={`rounded-lg border bg-papel p-4 ${a.severity === "warning" ? "border-peligro/50 border-l-4" : "border-linea"}`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${a.severity === "warning" ? "bg-peligro text-sobre" : "bg-trigo/20 text-trigo-texto"}`}
              >
                <Icon size={18} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{tk(`ui.alertKind_${a.kind}`)}</span>
                  <SeverityBadge severity={a.severity} />
                  {farmNames?.[a.farmId] && <span className="text-sm text-tinta-2">{farmNames[a.farmId]}</span>}
                  <span className="num ml-auto text-xs text-tinta-2">
                    {fmtDate(a.validFrom)}
                    {a.validTo && a.validTo - a.validFrom > 86_400_000 ? ` – ${fmtDate(a.validTo)}` : ""}
                  </span>
                </div>
                <p className="mt-1.5 text-[15px]">{a.summary}</p>
                <p className="mt-1 text-xs text-tinta-2">
                  {a.probability ? `${tk(`ui.probability_${a.probability}`)} · ` : ""}
                  {a.plotIds.length} {t("ui.plots").toLowerCase()} · {t("ui.orientative", { source: a.source })}
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  {a.useful === null ? (
                    <>
                      <span className="mr-1 text-tinta-2">{t("ui.useful")}</span>
                      <Button
                        variant="secondary"
                        icon={ThumbsUp}
                        className="h-8"
                        onClick={() => feedback.mutate({ id: a.id, useful: true })}
                      >
                        {t("ui.yes")}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={ThumbsDown}
                        className="h-8"
                        onClick={() => feedback.mutate({ id: a.id, useful: false })}
                      >
                        {t("ui.no")}
                      </Button>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-tinta-2">
                      <Check size={14} aria-hidden /> {t("ui.thanks")}
                    </span>
                  )}
                  <ShareWhatsappButton
                    variant="quiet"
                    className="ml-auto h-8"
                    text={alertShareText({
                      kindLabel: tk(`ui.alertKind_${a.kind}`),
                      severityLabel: tk(`ui.severity_${a.severity}`),
                      summary: a.summary,
                      farmName: farmNames?.[a.farmId],
                      validity: `${fmtDate(a.validFrom)}${a.validTo && a.validTo - a.validFrom > 86_400_000 ? ` – ${fmtDate(a.validTo)}` : ""}`,
                      link: `${window.location.origin}/avisos`,
                    })}
                  />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
