/** Diálogo de alta y de edición de una tarea. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { localDate } from "@yvy/shared";
import { patch, post } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import type { Plot, Task } from "../../lib/types";
import { Field, Form, Input, Modal, Select, toast, FormFooter } from "../ui";
import type { PlotPick, SetField, TaskDraft } from "./TaskFormParts";
import { KindField, PickedPlots, ScheduleFields } from "./TaskFormParts";

export type { PlotPick } from "./TaskFormParts";

/** Valores iniciales del formulario: los de la tarea que se edita o los de una tarea nueva. */
export function initialDraft(task: Task | undefined, farmId: string | undefined, firstAssignee: string): TaskDraft {
  return {
    farmId: task?.farmId ?? farmId ?? "",
    plotId: task?.plotId ?? "",
    assigneeId: task?.assigneeId ?? firstAssignee,
    title: task?.title ?? "",
    kind: task?.kind ?? "",
    dueDate: task?.dueDate ?? localDate(Date.now()),
    dueTime: task?.dueTime ?? "",
    priority: task?.priority ?? "normal",
    recurrence: task?.recurrence ?? "none",
    checklist: "",
  };
}

/**
 * Cuerpo del PATCH al editar. La lista de verificación no se toca y el lote solo se manda si el formulario
 * lo mostró (`withPlot`), para no borrarlo cuando la pantalla no trae los lotes.
 */
export function editBody(f: TaskDraft, withPlot: boolean) {
  return {
    title: f.title,
    assigneeId: f.assigneeId,
    ...(withPlot ? { plotId: f.plotId || null } : {}),
    kind: f.kind || null,
    dueDate: f.dueDate,
    dueTime: f.dueTime || null,
    priority: f.priority,
    recurrence: f.recurrence,
  };
}

/**
 * Diálogo para crear una tarea o, con `task`, para editarla.
 * @param farmId estancia fija; sin ella se elige.
 */
export function NewTaskModal({
  task,
  farmId,
  plots,
  pick,
  members,
  onClose,
}: {
  /** Si se pasa, el formulario edita esa tarea en lugar de crear una. */
  task?: Task;
  farmId?: string;
  /** Lotes elegibles. */
plots?: Plot[];
  /** Selección de lotes sobre el mapa. */
pick?: PlotPick;
  /** Personas a las que se puede asignar. */
members: { userId: string; fullName: string }[];
  onClose: () => void;
}) {
  const farms = useFarms();
  const qc = useQueryClient();
  const [f, setF] = useState(() => initialDraft(task, farmId, members[0]?.userId ?? ""));
  const picked = pick?.ids ?? [];
  const create = useMutation({
    mutationFn: () => {
      if (task) return patch(`/org/tasks/${task.id}`, editBody(f, !!plots)).then(() => ({ ids: [task.id] }));
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
      toast(task ? t("office.task.savedEdit") : ids.length > 1 ? t("ui.toast.tasksSaved", { n: ids.length }) : t("ui.toast.taskSaved"));
      onClose();
    },
  });
  const set: SetField = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // Mientras se eligen lotes en el mapa el diálogo se esconde sin desmontarse: el borrador no se pierde.
  return (
    <div hidden={!!pick?.picking}>
      <Modal title={task ? t("office.task.editTitle") : t("ui.new.task")} onClose={onClose}>
        <Form className="flex flex-col gap-3" onSubmit={() => create.mutate()}>
          <Field label={t("ui.task.title")}>
            <Input required value={f.title} onChange={set("title")} placeholder="Medir lluvia" />
          </Field>
          {!farmId && !task && (
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
          {plots && pick && !task && <PickedPlots plots={plots} pick={pick} />}
          <Field label={t("ui.common.assignee")}>
            <Select
              required
              value={f.assigneeId}
              onChange={set("assigneeId")}
              options={members.map((m) => ({ value: m.userId, label: m.fullName }))}
            />
          </Field>
          <ScheduleFields f={f} set={set} />
          <KindField kind={f.kind} onChange={set("kind")} />
          {!task && (
            <Field label={t("ui.task.checklist")}>
              <textarea
                className="min-h-20 w-full rounded-md border border-linea bg-papel px-3 py-2 text-sm"
                value={f.checklist}
                onChange={set("checklist")}
                placeholder={t("ui.task.checklistHint")}
              />
            </Field>
          )}
          <FormFooter error={create.error} disabled={create.isPending} label={t("ui.common.save")} />
        </Form>
      </Modal>
    </div>
  );
}
