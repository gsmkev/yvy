/** Hojas de tareas del equipo: formulario, menú de la fila y confirmación de borrado. */
import { RECORD_KINDS, RECURRENCES, TASK_PRIORITIES, t, type MessageKey } from "@yvy/shared";
import type { Farm, Plot } from "../../db/store";
import { Button, Row, Sheet, Text } from "../../ui/kit";
import { C, T } from "../../ui/theme";
import { DateField, FormSheet, SelectField, TextField } from "../ui";
import type { TaskEditor } from "./useTaskEditor";

const key = (k: string) => k as MessageKey;

interface FormProps {
  editor: TaskEditor;
  farms: Farm[];
  plots: Plot[];
  memberOptions: { value: string; label: string }[];
}

/** Formulario de alta y edición; la estancia y la lista de pasos solo se piden al crear. */
export function TaskFormSheet({ editor, farms, plots, memberOptions }: FormProps) {
  const { draft, set } = editor;
  const plotOptions = [{ value: "", label: t("ui.common.none") }, ...plots.filter((p) => p.farmId === draft?.farmId).map((p) => ({ value: p.id, label: p.name }))];
  return (
    <FormSheet visible={!!draft} title={draft?.id ? t("office.task.editTitle") : t("ui.new.task")} onClose={editor.close} onSubmit={editor.submit} submitLabel={t("ui.common.save")} pending={editor.formPending} error={editor.formErr}>
      {draft ? (
        <>
          <TextField label={t("ui.task.title")} value={draft.title} onChangeText={(v) => set({ title: v })} maxLength={200} />
          <SelectField label={t("ui.common.assignee")} value={draft.assigneeId} options={memberOptions} onChange={(v) => set({ assigneeId: v })} />
          {!draft.id ? <SelectField label={t("ui.common.farm")} value={draft.farmId} options={farms.map((f) => ({ value: f.id, label: f.name }))} onChange={(v) => set({ farmId: v, plotId: "" })} /> : null}
          <SelectField label={t("ui.common.plot")} value={draft.plotId} options={plotOptions} onChange={(v) => set({ plotId: v })} />
          <DateField label={t("ui.due.date")} value={draft.dueDate} onChange={(v) => set({ dueDate: v })} />
          <TextField label={t("ui.due.time")} hint={t("ui.due.timeHint")} value={draft.dueTime} onChangeText={(v) => set({ dueTime: v.replace(/[^\d:]/g, "").slice(0, 5) })} placeholder="08:30" />
          <SelectField label={t("ui.task.priority")} value={draft.priority} options={TASK_PRIORITIES.map((p) => ({ value: p, label: t(key(`ui.task.priority_${p}`)) }))} onChange={(v) => set({ priority: v })} />
          <SelectField label={t("ui.common.recurrence")} value={draft.recurrence} options={RECURRENCES.map((r) => ({ value: r, label: t(key(`ui.recurrence.${r}`)) }))} onChange={(v) => set({ recurrence: v })} />
          <SelectField label={t("ui.common.opensRecord")} value={draft.kind} options={[{ value: "", label: t("ui.common.none") }, ...RECORD_KINDS.map((k) => ({ value: k, label: t(key(`record-kinds.kind.${k}`)) }))]} onChange={(v) => set({ kind: v })} />
          {!draft.id ? <TextField label={t("ui.task.checklist")} kind="multiline" hint={t("office.task.checklistLines")} value={draft.checklist} onChangeText={(v) => set({ checklist: v })} /> : null}
        </>
      ) : null}
    </FormSheet>
  );
}

/** Menú de la fila: editar y borrar (o cancelar si la tarea se repite). */
export function TaskMenuSheet({ editor }: { editor: TaskEditor }) {
  const { menu } = editor;
  return (
    <Sheet visible={!!menu} title={menu?.title ?? ""} onClose={() => editor.setMenu(null)}>
      {menu ? (
        <>
          <Row title={t("ui.common.edit")} onPress={() => editor.openEdit(menu)} />
          {menu.status === "open" ? <Row title={menu.recurrence === "none" ? t("ui.common.delete") : t("office.task.cancelRecurring")} tone="danger" onPress={() => editor.askDelete(menu)} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}

/** Confirmación de borrado de la tarea elegida. */
export function DeleteTaskSheet({ editor }: { editor: TaskEditor }) {
  const { confirm } = editor;
  return (
    <Sheet visible={!!confirm} title={t("office.task.deleteTitle")} onClose={() => editor.setConfirm(null)}>
      {confirm ? (
        <>
          <Text style={T.body}>{t("office.task.deleteBody", { title: confirm.title })}</Text>
          {editor.deleteError ? (
            <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
              {editor.deleteError}
            </Text>
          ) : null}
          <Button kind="danger" title={t("ui.common.delete")} loading={editor.deletePending} onPress={() => void editor.doDelete(confirm)} style={{ marginTop: 16 }} />
          <Button kind="text" title={t("ui.common.cancel")} onPress={() => editor.setConfirm(null)} style={{ marginTop: 4 }} />
        </>
      ) : null}
    </Sheet>
  );
}
