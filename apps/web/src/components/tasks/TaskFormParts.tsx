/** Partes del formulario de tarea que no dependen de si se crea o se edita. */
import { closeRequirements, RECORD_KINDS, RECURRENCES, TASK_PRIORITIES } from "@yvy/shared";
import { t, tk } from "../../lib/i18n";
import type { Plot } from "../../lib/types";
import { Button, Field, Input, Select } from "../ui";

/** Selección de lotes en el mapa de la estancia; la maneja la pantalla que tiene el mapa. */
export interface PlotPick {
  ids: string[];
  setIds: (ids: string[]) => void;
  picking: boolean;
  setPicking: (v: boolean) => void;
}

/** Campos del formulario; los mismos al crear y al editar. */
export interface TaskDraft {
  farmId: string;
  plotId: string;
  assigneeId: string;
  title: string;
  kind: string;
  dueDate: string;
  dueTime: string;
  priority: string;
  recurrence: string;
  checklist: string;
}

/** Cambia un campo del borrador desde el evento de un control. */
export type SetField = (k: keyof TaskDraft) => (e: { target: { value: string } }) => void;

/** Lotes elegidos en el mapa y el botón para elegirlos. */
export function PickedPlots({ plots, pick }: { plots: Plot[]; pick: PlotPick }) {
  const picked = pick.ids;
  return (
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
      <Button onClick={() => pick.setPicking(true)}>{picked.length ? t("ui.task.pickChange") : t("ui.task.pickOnMap")}</Button>
      {picked.length > 1 && <p className="text-xs text-tinta-2">{t("ui.task.pickOneEach")}</p>}
    </div>
  );
}

/** Fecha, hora, prioridad y repetición. */
export function ScheduleFields({ f, set }: { f: TaskDraft; set: SetField }) {
  return (
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
  );
}

/** Registro que abre la tarea y qué pide para cerrarse. */
export function KindField({ kind, onChange }: { kind: string; onChange: (e: { target: { value: string } }) => void }) {
  const req = closeRequirements(kind);
  const hint = req && (req.photo && req.location ? "ui.close.needsPhotoLocation" : req.photo ? "ui.close.needsPhoto" : "ui.close.needsLocation");
  return (
    <Field label={t("ui.common.opensRecord")}>
      <Select
        value={kind}
        onChange={onChange}
        options={[{ value: "", label: t("ui.common.none") }, ...RECORD_KINDS.map((k) => ({ value: k, label: tk(`record-kinds.kind.${k}`) }))]}
      />
      {hint && <p className="mt-1 text-xs text-tinta-2">{t(hint)}</p>}
    </Field>
  );
}
