/** Diálogo de alta de una tarea. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { closeRequirements, localDate, RECORD_KINDS, RECURRENCES, TASK_PRIORITIES } from "@yvy/shared";
import { post } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import type { Plot } from "../../lib/types";
import { Button, ErrorBox, Field, Form, Input, Modal, Select, toast } from "../ui";

/** Selección de lotes en el mapa de la estancia; la maneja la pantalla que tiene el mapa. */
export interface PlotPick {
  ids: string[];
  setIds: (ids: string[]) => void;
  picking: boolean;
  setPicking: (v: boolean) => void;
}


/**
 * Diálogo para crear una tarea.
 * @param farmId estancia fija; sin ella se elige.
 * @param plots lotes elegibles.
 * @param pick selección de lotes sobre el mapa.
 * @param members personas a las que se puede asignar.
 */
export function NewTaskModal({
  farmId,
  plots,
  pick,
  members,
  onClose,
}: {
  farmId?: string;
  plots?: Plot[];
  pick?: PlotPick;
  members: { userId: string; fullName: string }[];
  onClose: () => void;
}) {
  const farms = useFarms();
  const qc = useQueryClient();
  const [f, setF] = useState({
    farmId: farmId ?? "",
    plotId: "",
    assigneeId: members[0]?.userId ?? "",
    title: "",
    kind: "",
    dueDate: localDate(Date.now()),
    dueTime: "",
    priority: "normal",
    recurrence: "none",
    checklist: "",
  });
  const picked = pick?.ids ?? [];
  const create = useMutation({
    mutationFn: () => {
      const { checklist, ...rest } = f;
      const items = checklist
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      return post<{ ids: string[] }>("/org/tasks", {
        ...rest,
        plotId: f.plotId || null,
        ...(picked.length ? { plotIds: picked } : {}),
        kind: f.kind || null,
        dueTime: f.dueTime || null,
        ...(items.length ? { checklist: items } : {}),
      });
    },
    onSuccess: ({ ids }) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast(ids.length > 1 ? t("ui.toast.tasksSaved", { n: ids.length }) : t("ui.toast.taskSaved"));
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // Mientras se eligen lotes en el mapa el diálogo se esconde sin desmontarse: el borrador no se pierde.
  return (
    <div hidden={!!pick?.picking}>
      <Modal title={t("ui.new.task")} onClose={onClose}>
        <Form className="flex flex-col gap-3" onSubmit={() => create.mutate()}>
          <Field label={t("ui.task.title")}>
            <Input required value={f.title} onChange={set("title")} placeholder="Medir lluvia" />
          </Field>
          {!farmId && (
            <Field label={t("ui.common.farm")}>
              <Select
                required
                value={f.farmId}
                onChange={set("farmId")}
                options={[
                  { value: "", label: "—" },
                  ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name })),
                ]}
              />
            </Field>
          )}
          {plots && !picked.length && (
            <Field label={t("ui.common.plot")}>
              <Select
                value={f.plotId}
                onChange={set("plotId")}
                options={[{ value: "", label: t("ui.common.none") }, ...plots.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Field>
          )}
          {plots && pick && (
            <div className="flex flex-col items-start gap-1.5 text-sm">
              {picked.length > 0 && (
                <p>
                  <span className="font-medium">{t("ui.task.pickedPlots", { n: picked.length })}</span>{" "}
                  {picked
                    .map((id) => plots.find((p) => p.id === id)?.name)
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <Button onClick={() => pick.setPicking(true)}>
                {picked.length ? t("ui.task.pickChange") : t("ui.task.pickOnMap")}
              </Button>
              {picked.length > 1 && <p className="text-xs text-tinta-2">{t("ui.task.pickOneEach")}</p>}
            </div>
          )}
          <Field label={t("ui.common.assignee")}>
            <Select
              required
              value={f.assigneeId}
              onChange={set("assigneeId")}
              options={members.map((m) => ({ value: m.userId, label: m.fullName }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("ui.due.date")}>
              <Input type="date" required value={f.dueDate} onChange={set("dueDate")} />
            </Field>
            <Field label={t("ui.due.time")} hint={t("ui.due.timeHint")}>
              <Input type="time" value={f.dueTime} onChange={set("dueTime")} />
            </Field>
            <Field label={t("ui.task.priority")}>
              <Select
                value={f.priority}
                onChange={set("priority")}
                options={TASK_PRIORITIES.map((p) => ({ value: p, label: tk(`ui.task.priority_${p}`) }))}
              />
            </Field>
            <Field label={t("ui.common.recurrence")}>
              <Select
                value={f.recurrence}
                onChange={set("recurrence")}
                options={RECURRENCES.map((r) => ({ value: r, label: tk(`ui.recurrence.${r}`) }))}
              />
            </Field>
          </div>
          <Field label={t("ui.common.opensRecord")}>
            <Select
              value={f.kind}
              onChange={set("kind")}
              options={[
                { value: "", label: t("ui.common.none") },
                ...RECORD_KINDS.map((k) => ({ value: k, label: tk(`record-kinds.kind.${k}`) })),
              ]}
            />
            {closeRequirements(f.kind) && (
              <p className="mt-1 text-xs text-tinta-2">
                {t(
                  closeRequirements(f.kind)!.photo && closeRequirements(f.kind)!.location
                    ? "ui.close.needsPhotoLocation"
                    : closeRequirements(f.kind)!.photo
                      ? "ui.close.needsPhoto"
                      : "ui.close.needsLocation",
                )}
              </p>
            )}
          </Field>
          <Field label={t("ui.task.checklist")}>
            <textarea
              className="min-h-20 w-full rounded-md border border-linea bg-papel px-3 py-2 text-sm"
              value={f.checklist}
              onChange={set("checklist")}
              placeholder={t("ui.task.checklistHint")}
            />
          </Field>
          {create.error && <ErrorBox error={create.error} />}
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {t("ui.common.save")}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
