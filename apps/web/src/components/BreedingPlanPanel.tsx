/** Plan reproductivo (ADR 0005): estación de servicio, línea de tiempo del ciclo, tareas y indicadores. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BREEDING_DAYS_LIMITS,
  indicatorLabel,
  indicatorValueText,
  isBreedingStart,
  localDate,
  reproPlan,
  stageTaskDate,
  upcomingStages,
  type PlanStage,
  type ReproPlanResponse,
} from "@yvy/shared";
import { get, post, put } from "../lib/api";
import { fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { Button, Card, ErrorBox, Field, Form, Input, Spinner, Stat, toast } from "./ui";

const stageDates = (s: PlanStage) => (s.from === s.to ? fmtIsoDate(s.from) : t("ui.repro.planDates", { from: fmtIsoDate(s.from), to: fmtIsoDate(s.to) }));

function Settings({ farmId, d }: { farmId: string; d: ReproPlanResponse }) {
  const qc = useQueryClient();
  const [start, setStart] = useState(`${d.cycleYear}-${d.breedingStart}`);
  const [days, setDays] = useState(String(d.breedingDays));
  const ok = isBreedingStart(start.slice(5)) && Number(days) >= BREEDING_DAYS_LIMITS.min && Number(days) <= BREEDING_DAYS_LIMITS.max;
  const save = useMutation({
    mutationFn: () => put(`/org/farms/${farmId}/livestock-settings`, { breedingStart: start.slice(5), breedingDays: Number(days) }),
    onSuccess: () => {
      toast(t("ui.repro.planSaved"));
      return qc.invalidateQueries({ queryKey: ["repro-plan", farmId] });
    },
  });
  return (
    <Form className="flex flex-wrap items-end gap-3" onSubmit={() => { if (ok) save.mutate(); }}>
      <Field label={t("ui.repro.planStart")}>
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label={t("ui.repro.planDays")}>
        <Input inputMode="numeric" className="w-24" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <Button variant="primary" type="submit" disabled={!ok || save.isPending}>
        {t("ui.common.save")}
      </Button>
      {save.error ? <ErrorBox error={save.error} /> : null}
    </Form>
  );
}

export function BreedingPlanPanel({ farmId }: { farmId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const canEdit = me.data?.role === "owner" || me.data?.role === "admin";
  const q = useQuery({ queryKey: ["repro-plan", farmId], queryFn: () => get<ReproPlanResponse>(`/org/farms/${farmId}/repro-plan`) });
  const today = localDate(Date.now());
  const createTasks = useMutation({
    mutationFn: async () => {
      const d = q.data!;
      const stages = upcomingStages(reproPlan(d.cycleYear, d.breedingStart, d.breedingDays), today);
      const title = (s: PlanStage) => t("ui.repro.planTaskTitle", { stage: tk(`ui.repro.planStage_${s.id}`) });
      // No repetir las que ya existen (mismo título y misma fecha).
      const existing = await get<{ title: string; dueDate: string }[]>(`/org/tasks?farmId=${farmId}&from=${today}&to=${stages[stages.length - 1]?.to ?? today}`);
      const have = new Set(existing.map((x) => `${x.title}|${x.dueDate}`));
      const todo = stages.filter((s) => !have.has(`${title(s)}|${stageTaskDate(s, today)}`));
      for (const s of todo)
        await post("/org/tasks", { farmId, assigneeId: me.data!.user.id, title: title(s), dueDate: stageTaskDate(s, today), plotIds: undefined, plotId: null });
      return todo.length;
    },
    onSuccess: (n) => {
      toast(n > 0 ? t("ui.repro.planTasksCreated", { n }) : t("ui.repro.planTasksNone"));
      return qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  if (q.isLoading) return <Spinner rows={4} h={56} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const stages = reproPlan(d.cycleYear, d.breedingStart, d.breedingDays);
  return (
    <div className="mt-4 flex flex-col gap-5">
      <div>
        <h2 className="eyebrow">{t("ui.repro.planTitle", { year: d.cycleYear })}</h2>
        {d.isDefault && <p className="mt-1 text-sm text-tinta-2">{t("ui.repro.planDefault")}</p>}
      </div>
      {canEdit && <Settings key={`${d.breedingStart}|${d.breedingDays}`} farmId={farmId} d={d} />}
      <ol className="flex flex-col divide-y divide-linea border-y border-linea">
        {stages.map((s) => {
          const now = s.from <= today && today <= s.to;
          const past = s.to < today;
          return (
            <li key={s.id} className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3 ${past ? "text-tinta-2" : ""}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium">{tk(`ui.repro.planStage_${s.id}`)}</p>
                <p className="text-xs text-tinta-2">{tk(`ui.repro.planHint_${s.id}`)}</p>
              </div>
              <p className="num text-sm">
                {stageDates(s)}
                {now && <span className="ml-2 font-medium text-accion">{t("ui.repro.planNow")}</span>}
                {past && <span className="ml-2 text-xs">{t("ui.repro.planPast")}</span>}
              </p>
            </li>
          );
        })}
      </ol>
      <div>
        <Button variant="secondary" disabled={createTasks.isPending || !me.data} onClick={() => createTasks.mutate()}>
          {t("ui.repro.planCreateTasks")}
        </Button>
        {createTasks.error ? <ErrorBox error={createTasks.error} /> : null}
      </div>
      {d.indicators.length > 0 && (
        <div>
          <p className="eyebrow mb-2">{t("ui.repro.planIndicators")}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {d.indicators.map((i) => (
              <Stat key={i.id} label={indicatorLabel(i)} value={indicatorValueText(i)} />
            ))}
          </div>
        </div>
      )}
      <Card>
        <p className="text-sm font-medium">{t("ui.repro.planWhyTitle")}</p>
        <p className="mt-1 text-sm text-tinta-2">{t("ui.repro.planWhy")}</p>
      </Card>
    </div>
  );
}
