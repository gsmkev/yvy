/** Campañas oficiales de SENACSA en el calendario sanitario Planificar crea el evento y las tareas. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { localDate, senacsaNote, senacsaPlanDate, type SenacsaCampaign, type SenacsaResponse } from "@yvy/shared";
import { get, post } from "../lib/api";
import { fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms } from "../lib/queries";
import { Button, Card, ErrorBox, SectionHead, toast } from "./ui";

/** Campañas oficiales de SENACSA del año con el botón para planificarlas. */
export function SenacsaCampaigns() {
  const qc = useQueryClient();
  const farms = useFarms();
  const today = localDate(Date.now());
  const year = Number(today.slice(0, 4));
  const q = useQuery({ queryKey: ["senacsa", year], queryFn: () => get<SenacsaResponse>(`/org/senacsa?year=${year}`) });
  const plan = useMutation({
    mutationFn: (c: SenacsaCampaign) =>
      post<{ tasksCreated: number }>("/org/sanitary-events", {
        reason: c.reason,
        plannedDate: senacsaPlanDate(c, today),
        farmId: farms.data?.length === 1 ? farms.data[0]!.id : null,
        categories: c.categories,
        note: senacsaNote(c),
        createTasks: true,
      }),
    onSuccess: () => {
      toast(t("ui.senacsa.planSaved"));
      return Promise.all(["senacsa", "sanitary", "tasks"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
  });
  const open = (q.data?.campaigns ?? []).filter((c) => c.to >= today);
  if (!open.length) return null;
  return (
    <section aria-label={t("ui.senacsa.title")} className="flex flex-col gap-2">
      <SectionHead title={t("ui.senacsa.title")} />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {open.map((c) => (
          <Card key={c.id} className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="mb-1 inline-block rounded bg-accion/10 px-1.5 py-0.5 text-xs font-medium text-accion">{t("ui.senacsa.badge")}</span>
                <p className="text-sm font-medium">
                  {tk(`ui.senacsa.name_${c.reason}`)} · {t("ui.senacsa.period", { n: c.period })}
                </p>
              </div>
              {q.data!.planned.includes(c.id) ? (
                <span className="shrink-0 text-sm text-accion">{t("ui.senacsa.planned")}</span>
              ) : (
                <Button size="sm" disabled={plan.isPending} onClick={() => plan.mutate(c)}>
                  {t("ui.senacsa.plan")}
                </Button>
              )}
            </div>
            <p className="num text-sm text-tinta-2">
              {t("ui.senacsa.dates", { from: fmtIsoDate(c.from), to: fmtIsoDate(c.to) })}
              {c.registerUntil && " · " + t("ui.senacsa.register", { date: fmtIsoDate(c.registerUntil) })}
            </p>
            <p className="text-xs text-tinta-2">{c.appliesTo}</p>
            {c.note && <p className="text-xs text-tinta-2">{c.note}</p>}
          </Card>
        ))}
      </div>
      <p className="text-xs text-tinta-2">
        {t("ui.senacsa.disclaimer")} {open[0]!.source}.
      </p>
      {plan.error ? <ErrorBox error={plan.error} /> : null}
    </section>
  );
}
