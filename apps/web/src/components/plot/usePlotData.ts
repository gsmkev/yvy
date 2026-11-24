import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "../../lib/api";
import { fmtNum, toIso } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { Member, Plot, PlotHistoryRow, ProblemArea } from "../../lib/types";
import { toast } from "../ui";

export interface Ndvi {
  series: { acquiredAt: number; mean: number; p10: number; p90: number; validPct: number; lowConfidence: boolean }[];
  farmAvg: { acquiredAt: number; mean: number }[];
  current: { acquiredAt: number; mean: number; lowConfidence: boolean } | null;
  others?: Record<string, { acquiredAt: number; mean: number; lowConfidence: boolean }>;
  deltaVsFarmPct: number | null;
}

export const usePlotNdvi = (plot: Plot, enabled: boolean) =>
  useQuery({
    queryKey: ["ndvi", plot.id],
    queryFn: () => get<Ndvi>(`/org/plots/${plot.id}/ndvi`),
    enabled,
  });

export const usePlotHistory = (plot: Plot) =>
  useQuery({
    queryKey: ["plot-history", plot.id],
    queryFn: () => get<PlotHistoryRow[]>(`/org/plots/${plot.id}/seasons`),
    enabled: plot.kind === "crop",
  });

/** Borrador del formulario de edición del lote (sobrevive a abrir y cerrar) y su guardado por PATCH. */
export function usePlotForm(plot: Plot, onSaved: () => void) {
  const qc = useQueryClient();
  const draft = {
    name: plot.name,
    kind: plot.kind,
    crop: plot.crop ?? "",
    season: plot.season ?? "",
    sowingDate: plot.sowingDate ?? "",
    pastureType: plot.pastureType ?? "",
  };
  const [form, setForm] = useState(draft);
  const save = useMutation({
    mutationFn: () =>
      patch(`/org/plots/${plot.id}`, {
        name: form.name,
        kind: form.kind,
        crop: form.kind === "crop" ? form.crop || null : null,
        season: form.kind === "crop" ? form.season || null : null,
        sowingDate: form.sowingDate || null,
        pastureType: form.kind === "pasture" ? form.pastureType || null : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farm", plot.farmId] });
      toast(t("ui.toast.plotUpdated"));
      onSaved();
    },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return { form, set, save };
}
export type PlotForm = ReturnType<typeof usePlotForm>;

/** S-08: manda una tarea de recorrida a quien se elija, sobre un área problema del lote. */
export function useProblemTask(plot: Plot, workers: Member[]) {
  const qc = useQueryClient();
  const [assigneeId, setAssigneeId] = useState(workers[0]?.userId ?? "");
  const sendArea = useMutation({
    mutationFn: (a: ProblemArea) =>
      post("/org/tasks", {
        farmId: plot.farmId,
        plotId: plot.id,
        assigneeId: assigneeId || workers[0]?.userId,
        title: t("ui.problem.taskTitle", { ha: fmtNum(Math.round(a.areaHa * 10) / 10), plot: plot.name }),
        kind: "scouting",
        dueDate: toIso(Date.now()),
        recurrence: "none",
        lon: a.lon,
        lat: a.lat,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      const w = workers.find((x) => x.userId === (assigneeId || workers[0]?.userId));
      toast(t("ui.problem.taskSent", { name: w?.fullName ?? "" }));
    },
  });
  return { assigneeId, setAssigneeId, sendArea };
}
export type ProblemTask = ReturnType<typeof useProblemTask>;
