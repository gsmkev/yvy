/** Plan reproductivo: estación de servicio, línea de tiempo del ciclo, tareas e indicadores. GET /org/farms/:id/repro-plan. */
import { useState } from "react";
import { View } from "react-native";
import { Settings2 } from "lucide-react-native";
import { BREEDING_DAYS_LIMITS, indicatorLabel, indicatorValueText, isBreedingStart, localDate, reproPlan, stageTaskDate, t, upcomingStages, type MessageKey, type PlanStage, type ReproPlanResponse } from "@yvy/shared";
import { getSession } from "../../../src/lib/session";
import { showToast } from "../../../src/lib/toast";
import { syncNow } from "../../../src/lib/sync";
import { useFarmPick } from "../../../src/office/farmPick";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, StatRow, TextField } from "../../../src/office/ui";
import { Button, SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

const dmy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dates = (s: PlanStage) => (s.from === s.to ? dmy(s.from) : t("ui.repro.planDates", { from: dmy(s.from), to: dmy(s.to) }));

/** Plan reproductivo del rodeo. */
export default function Plan() {
  const { farms, farm, setFarmId } = useFarmPick();
  const session = getSession();
  const canEdit = session?.organization.role === "owner" || session?.organization.role === "admin";
  const today = localDate(Date.now());
  const q = useOnline<ReproPlanResponse>(farm ? `/org/farms/${farm.id}/repro-plan` : null);
  const tasks = useOnline<{ title: string; dueDate: string }[]>(farm ? `/org/tasks?farmId=${farm.id}&from=${today}` : null);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [days, setDays] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const save = useOnlineMutation<{ breedingStart: string; breedingDays: number }, unknown>("PUT", `/org/farms/${farm?.id}/livestock-settings`, { invalidate: [`/org/farms/${farm?.id}/repro-plan`] });
  const create = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/tasks", { invalidate: ["/org/tasks"] });

  const submit = async () => {
    const n = Number(days);
    if (!isBreedingStart(start.slice(5)) || !(n >= BREEDING_DAYS_LIMITS.min && n <= BREEDING_DAYS_LIMITS.max)) return setFormError(t("ui.repro.planDays"));
    setFormError(null);
    const r = await save.mutate({ breedingStart: start.slice(5), breedingDays: n });
    if (r.ok) {
      setOpen(false);
      showToast(t("ui.repro.planSaved"));
      void q.refresh();
    }
  };
  const createTasks = async (d: ReproPlanResponse) => {
    if (!farm || !session) return;
    const title = (s: PlanStage) => t("ui.repro.planTaskTitle", { stage: t(`ui.repro.planStage_${s.id}` as MessageKey) });
    const have = new Set((tasks.data ?? []).map((x) => `${x.title}|${x.dueDate}`));
    const todo = upcomingStages(reproPlan(d.cycleYear, d.breedingStart, d.breedingDays), today).filter((s) => !have.has(`${title(s)}|${stageTaskDate(s, today)}`));
    for (const s of todo) {
      const r = await create.mutate({ farmId: farm.id, assigneeId: session.user.id, title: title(s), dueDate: stageTaskDate(s, today) });
      if (!r.ok) return showToast(r.error);
    }
    showToast(todo.length > 0 ? t("ui.repro.planTasksCreated", { n: todo.length }) : t("ui.repro.planTasksNone"));
    if (todo.length > 0) void syncNow();
    void tasks.refresh();
  };

  return (
    <FarmFrame
      title={t("ui.repro.planSection")}
      farms={farms}
      farm={farm}
      setFarmId={setFarmId}
      query={q}
      action={canEdit && q.data ? { label: t("ui.repro.planStart"), icon: Settings2, onPress: () => { save.reset(); setFormError(null); setStart(`${q.data!.cycleYear}-${q.data!.breedingStart}`); setDays(String(q.data!.breedingDays)); setOpen(true); } } : undefined}
    >
      <OnlineState query={q} empty={{ title: t("ui.repro.planSection") }}>
        {(d) => {
          const stages = reproPlan(d.cycleYear, d.breedingStart, d.breedingDays);
          return (
            <View>
              <SectionHeader title={t("ui.repro.planTitle", { year: d.cycleYear })} />
              {d.isDefault && <Text style={T.small}>{t("ui.repro.planDefault")}</Text>}
              <DataList
                rows={stages}
                keyOf={(s) => s.id}
                title={(s) => t(`ui.repro.planStage_${s.id}` as MessageKey)}
                subtitle={(s) => `${dates(s)} · ${t(`ui.repro.planHint_${s.id}` as MessageKey)}`}
                right={(s) =>
                  s.from <= today && today <= s.to ? (
                    <Text style={[T.smallMedium, { color: C.accionOscuro, textAlign: "right" }]}>{t("ui.repro.planNow")}</Text>
                  ) : s.to < today ? (
                    <Text style={[T.small, { textAlign: "right" }]}>{t("ui.repro.planPast")}</Text>
                  ) : null
                }
                empty={{ title: t("ui.repro.planSection") }}
              />
              <Button kind="secondary" title={t("ui.repro.planCreateTasks")} loading={create.pending} onPress={() => createTasks(d)} style={{ marginTop: 16 }} />
              {d.indicators.length > 0 && (
                <>
                  <SectionHeader title={t("ui.repro.planIndicators")} />
                  <StatRow items={d.indicators.map((i) => ({ label: indicatorLabel(i), value: indicatorValueText(i) }))} />
                </>
              )}
              <SectionHeader title={t("ui.repro.planWhyTitle")} />
              <Text style={T.small}>{t("ui.repro.planWhy")}</Text>
            </View>
          );
        }}
      </OnlineState>
      <FormSheet visible={open} title={t("ui.repro.planSection")} onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={formError ?? save.error}>
        <DateField label={t("ui.repro.planStart")} value={start} onChange={setStart} />
        <TextField label={t("ui.repro.planDays")} value={days} onChangeText={setDays} kind="number" />
      </FormSheet>
    </FarmFrame>
  );
}
