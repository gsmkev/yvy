/** Pedidos de prueba del formulario de la landing. El equipo escribe por WhatsApp y los marca como atendidos. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorBox, SectionHead, toast } from "../../components/ui";
import { get, post } from "../../lib/api";
import { fmtDateTime, fmtHa, fmtNum } from "../../lib/format";
import { t } from "../../lib/i18n";

interface TrialRequestRow {
  id: string;
  name: string;
  whatsapp: string;
  company: string | null;
  crops: string[];
  hectares: number | null;
  employees: number | null;
  department: string | null;
  createdAt: number;
}

/** Pedidos de prueba del formulario de la landing. El equipo escribe por WhatsApp y los marca como atendidos. */
export function TrialRequests() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-trial-requests"], queryFn: () => get<TrialRequestRow[]>("/admin/trial-requests") });
  const done = useMutation({
    mutationFn: (id: string) => post(`/admin/trial-requests/${id}/contacted`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-trial-requests"] });
      toast(t("ui.internal.trialMarked"));
    },
  });
  if (!q.data) return null;
  return (
    <section>
      <SectionHead title={t("ui.internal.trialRequests")} />
      {!q.data.length && <EmptyState compact title={t("ui.internal.trialRequestsNone")} />}
      {done.error && <ErrorBox error={done.error} />}
      <ul className="mt-2 divide-y divide-linea">
        {q.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.name}
                {r.company ? ` · ${r.company}` : ""}
              </p>
              <p className="num text-tinta-2">
                <a className="underline" href={`https://wa.me/${r.whatsapp}`} target="_blank" rel="noreferrer">
                  +{r.whatsapp}
                </a>
                {" · "}
                {[
                  r.crops.join(", "),
                  r.hectares !== null ? fmtHa(r.hectares) : null,
                  r.employees !== null ? t("ui.internal.trialEmployees", { n: fmtNum(r.employees) }) : null,
                  r.department,
                  fmtDateTime(r.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button disabled={done.isPending} onClick={() => done.mutate(r.id)}>
              {t("ui.internal.trialContacted")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
