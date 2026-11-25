/** Estado y guardado de las tareas del equipo por REST: alta, edición, borrado (o cancelación si se repite) y menú. */
import { useState } from "react";
import { t } from "@yvy/shared";
import type { Task } from "../../db/store/core";
import { syncNow } from "../../lib/sync";
import { showToast } from "../../lib/toast";
import { useOnlineMutation } from "../useOnlineMutation";
import { draftError, editDraft, newDraft, type Draft } from "./model";

/** Edición de tareas: borrador abierto, menú de la fila, confirmación de borrado y errores. */
export function useTaskEditor() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [menu, setMenu] = useState<Task | null>(null);
  const [confirm, setConfirm] = useState<Task | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { ids: string[] }>("POST", "/org/tasks", { invalidate: ["/org/members"] });
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/tasks/${b.id}`);
  const remove = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/tasks/${b.id}`);

  const openNew = (today: string, assigneeId: string, farmId: string) => {
    setFormError(null);
    create.reset();
    setDraft(newDraft(today, assigneeId, farmId));
  };
  const openEdit = (x: Task) => {
    setMenu(null);
    setFormError(null);
    edit.reset();
    setDraft(editDraft(x));
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const submit = async () => {
    if (!draft) return;
    const bad = draftError(draft);
    if (bad) return setFormError(bad);
    setFormError(null);
    const common = { title: draft.title.trim(), assigneeId: draft.assigneeId, plotId: draft.plotId || null, kind: draft.kind || null, dueDate: draft.dueDate, dueTime: draft.dueTime || null, priority: draft.priority, recurrence: draft.recurrence };
    const items = draft.checklist.split("\n").map((l) => l.trim()).filter(Boolean);
    const r = draft.id ? await edit.mutate({ id: draft.id, ...common }) : await create.mutate({ ...common, farmId: draft.farmId, ...(items.length ? { checklist: items } : {}) });
    if (!r.ok) return;
    setDraft(null);
    showToast(t(draft.id ? "office.task.savedEdit" : "ui.toast.taskSaved"));
    void syncNow();
  };

  const askDelete = (x: Task) => {
    remove.reset();
    edit.reset();
    setConfirm(x);
    setMenu(null);
  };
  const doDelete = async (x: Task) => {
    const r = x.recurrence === "none" ? await remove.mutate({ id: x.id }) : await edit.mutate({ id: x.id, status: "cancelled" });
    if (!r.ok) return;
    setConfirm(null);
    showToast(t("ui.toast.taskDeleted"));
    void syncNow();
  };

  return {
    draft,
    set,
    close: () => setDraft(null),
    openNew,
    openEdit,
    submit,
    menu,
    setMenu,
    confirm,
    setConfirm,
    askDelete,
    doDelete,
    formPending: create.pending || edit.pending,
    formErr: formError ?? (draft?.id ? edit.error : create.error),
    deleteError: remove.error ?? edit.error,
    deletePending: remove.pending || edit.pending,
  };
}

/** Editor de tareas con sus hojas y mutaciones. */
export type TaskEditor = ReturnType<typeof useTaskEditor>;
