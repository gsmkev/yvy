/** Hojas de campañas: alta de campaña, plan de cultivo de un lote y confirmación de borrado. */
import { CROPS, DENSITY_UNITS, t, type MessageKey } from "@yvy/shared";
import { Button, Sheet, Text } from "../../ui/kit";
import { C, T } from "../../ui/theme";
import { DateField, FormSheet, SelectField, TextField } from "../ui";
import type { PlanDraft } from "./plan";
import type { SeasonEditor, SeasonRef } from "./useSeasonEditor";

const k = (s: string) => s as MessageKey;

/** Formulario de campaña nueva. */
export function CreateSeasonSheet({ editor }: { editor: SeasonEditor }) {
  const { creating, setCreating } = editor;
  return (
    <FormSheet visible={!!creating} title={t("ui.season.new")} onClose={() => setCreating(null)} onSubmit={editor.submitCreate} submitLabel={t("ui.common.save")} pending={editor.createPending} error={editor.createError}>
      {creating ? (
        <>
          <TextField label={t("ui.season.name")} placeholder={t("ui.season.namePlaceholder")} value={creating.name} onChangeText={(v) => setCreating({ ...creating, name: v })} maxLength={80} />
          <DateField label={t("ui.season.start")} value={creating.start} onChange={(v) => setCreating({ ...creating, start: v })} />
          <DateField label={t("ui.season.end")} value={creating.end} onChange={(v) => setCreating({ ...creating, end: v })} />
        </>
      ) : null}
    </FormSheet>
  );
}

/** Formulario del plan de un lote en la campaña elegida; con plan previo ofrece quitarlo. */
export function PlanSheet({ editor, season, hasPlan }: { editor: SeasonEditor; season: SeasonRef | null; hasPlan: boolean }) {
  const { planning, setPlanning } = editor;
  const set = (patch: Partial<PlanDraft>) => setPlanning((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p));
  return (
    <FormSheet visible={!!planning} title={planning && season ? `${planning.name}, ${season.name}` : ""} onClose={() => setPlanning(null)} onSubmit={editor.submitPlan} submitLabel={t("ui.season.planSave")} pending={editor.savePlanPending} error={editor.planError}>
      {planning ? (
        <>
          <SelectField label={t("ui.common.crop")} value={planning.draft.crop} options={[{ value: "", label: t("ui.common.none") }, ...CROPS.map((c) => ({ value: c as string, label: t(k(`fields.crop.${c}`)) }))]} onChange={(v) => set({ crop: v })} />
          <TextField label={t("ui.season.variety")} value={planning.draft.variety} onChangeText={(v) => set({ variety: v })} maxLength={80} />
          <DateField label={t("ui.season.plannedSowing")} value={planning.draft.sowing} onChange={(v) => set({ sowing: v })} />
          <TextField label={t("ui.season.density")} kind="decimal" value={planning.draft.density} onChangeText={(v) => set({ density: v })} />
          <SelectField label={t("ui.season.densityUnit")} value={planning.draft.unit} options={DENSITY_UNITS.map((u) => ({ value: u as string, label: t(k(`fields.density.unit_${u}`)) }))} onChange={(v) => set({ unit: v })} />
          <TextField label={t("ui.season.targetYield")} kind="decimal" value={planning.draft.target} onChangeText={(v) => set({ target: v })} />
          {hasPlan ? <Button kind="text" title={t("ui.season.planClear")} loading={editor.clearPlanPending} onPress={() => void editor.removePlan()} style={{ marginTop: 8 }} /> : null}
        </>
      ) : null}
    </FormSheet>
  );
}

/** Confirmación para borrar la campaña elegida. */
export function DeleteSeasonSheet({ editor, season }: { editor: SeasonEditor; season: SeasonRef | null }) {
  const { removeState } = editor;
  return (
    <Sheet visible={editor.confirmDelete} title={t("ui.season.delete")} onClose={editor.closeDelete}>
      {season ? (
        <>
          <Text style={T.body}>{t("ui.season.confirmDelete", { name: season.name })}</Text>
          {removeState.error ? (
            <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
              {removeState.error}
            </Text>
          ) : null}
          <Button kind="danger" title={t("ui.common.delete")} loading={removeState.pending} onPress={() => void editor.confirmRemove()} style={{ marginTop: 16 }} />
          <Button kind="text" title={t("ui.common.cancel")} onPress={editor.closeDelete} style={{ marginTop: 4 }} />
        </>
      ) : null}
    </Sheet>
  );
}
