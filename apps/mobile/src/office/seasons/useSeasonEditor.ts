/** Estado y guardado de campañas y planes de cultivo por REST (crear, cerrar o reabrir, borrar, planificar un lote). */
import { useState } from "react";
import { t, type MessageKey } from "@yvy/shared";
import type { Plot } from "../../db/store";
import type { PlanLite } from "../../lib/plotInfo";
import { syncNow } from "../../lib/sync";
import { showToast } from "../../lib/toast";
import { useOnlineMutation } from "../useOnlineMutation";
import { planBody, planDraftOf, type PlanDraft } from "./plan";

/** Campaña elegida en la pantalla. */
export interface SeasonRef {
  id: string;
  name: string;
  active: boolean;
}
/** Campos de la campaña nueva. */
export interface NewSeason {
  name: string;
  start: string;
  end: string;
}
/** Plan en edición: lote y borrador. */
export interface Planning {
  plotId: string;
  name: string;
  draft: PlanDraft;
}

const done = (msg: MessageKey) => {
  showToast(t(msg));
  void syncNow();
};

/** Mutaciones de campañas con sus hojas abiertas; `onPicked` elige la campaña recién creada o ninguna al borrar. */
export function useSeasonEditor(season: SeasonRef | null, planOf: (plotId: string) => PlanLite | undefined, onPicked: (id: string | null) => void) {
  const [creating, setCreating] = useState<NewSeason | null>(null);
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/seasons");
  const toggle = useOnlineMutation<{ id: string; active: boolean }, { ok: boolean }>("PATCH", (b) => `/org/seasons/${b.id}`);
  const remove = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/seasons/${b.id}`);
  const savePlan = useOnlineMutation<Record<string, unknown> & { seasonId: string; plotId: string }, { ok: boolean }>("PUT", (b) => `/org/seasons/${b.seasonId}/plots/${b.plotId}`);
  const clearPlan = useOnlineMutation<{ seasonId: string; plotId: string }, { ok: boolean }>("DELETE", (b) => `/org/seasons/${b.seasonId}/plots/${b.plotId}`);

  const openCreate = () => {
    create.reset();
    setFormError(null);
    setCreating({ name: "", start: "", end: "" });
  };
  const submitCreate = async () => {
    if (!creating) return;
    const name = creating.name.trim();
    if (!name) return setFormError(t("office.season.needsName"));
    if (creating.start && creating.end && creating.end < creating.start) return setFormError(t("office.season.endBeforeStart"));
    setFormError(null);
    const r = await create.mutate({ name, startDate: creating.start || null, endDate: creating.end || null, active: true });
    if (!r.ok) return;
    onPicked(r.data.id);
    setCreating(null);
    done("ui.toast.seasonSaved");
  };

  const openPlan = (plot: Plot) => {
    savePlan.reset();
    clearPlan.reset();
    setFormError(null);
    setPlanning({ plotId: plot.id, name: plot.name, draft: planDraftOf(planOf(plot.id), plot) });
  };
  const submitPlan = async () => {
    if (!planning || !season) return;
    const body = planBody(planning.draft);
    if ("error" in body) return setFormError(body.error as string);
    setFormError(null);
    const r = await savePlan.mutate({ seasonId: season.id, plotId: planning.plotId, ...body });
    if (!r.ok) return;
    setPlanning(null);
    done("ui.toast.seasonPlanSaved");
  };
  const removePlan = async () => {
    if (!planning || !season) return;
    const r = await clearPlan.mutate({ seasonId: season.id, plotId: planning.plotId });
    if (!r.ok) return;
    setPlanning(null);
    done("ui.toast.seasonPlanSaved");
  };

  const toggleActive = async () => {
    if (!season) return;
    const r = await toggle.mutate({ id: season.id, active: !season.active });
    if (r.ok) done("ui.toast.seasonSaved");
  };
  const askDelete = () => {
    remove.reset();
    setConfirmDelete(true);
  };
  const confirmRemove = async () => {
    if (!season) return;
    const r = await remove.mutate({ id: season.id });
    if (!r.ok) return;
    setConfirmDelete(false);
    onPicked(null);
    done("ui.toast.seasonDeleted");
  };

  return {
    creating,
    setCreating,
    planning,
    setPlanning,
    confirmDelete,
    closeDelete: () => setConfirmDelete(false),
    openCreate,
    submitCreate,
    openPlan,
    submitPlan,
    removePlan,
    toggleActive,
    askDelete,
    confirmRemove,
    createPending: create.pending,
    removeState: remove,
    toggleError: toggle.error,
    savePlanPending: savePlan.pending,
    clearPlanPending: clearPlan.pending,
    createError: formError ?? create.error,
    planError: formError ?? savePlan.error ?? clearPlan.error,
  };
}

/** Editor de campañas con sus hojas y mutaciones. */
export type SeasonEditor = ReturnType<typeof useSeasonEditor>;
