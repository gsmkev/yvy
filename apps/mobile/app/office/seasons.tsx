/**
 * Campañas (función 59): campañas y plan de cultivo por lote desde la base local (anda sin señal). Crear campaña,
 * planificar un lote, cerrar/reabrir y borrar van por REST (POST/PATCH/DELETE /org/seasons, PUT /org/seasons/:id/plots/:id)
 * y solo para dueño, administrador y agrónomo; el supervisor las ve. Después de guardar se sincroniza.
 */
import { useMemo, useState } from "react";
import { Plus } from "lucide-react-native";
import { CROPS, DENSITY_UNITS, isFieldRole, t, type MessageKey, isoToDisplay, areaLabel, haToArea } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { localPlans, localSeasons, type PlanLite } from "../../src/lib/plotInfo";
import { useSession } from "../../src/lib/session";
import { syncNow } from "../../src/lib/sync";
import { showToast } from "../../src/lib/toast";
import { useUnits } from "../../src/lib/units";
import { useLocal } from "../../src/lib/useLocal";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { fmtNumber, parseDecimal } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { DataList, DateField, FilterChips, FormSheet, SelectField, StatRow, TextField } from "../../src/office/ui";
import { Button, EmptyState, Row, SectionHeader, Sheet, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

const k = (s: string) => s as MessageKey;
const can = (role: string | undefined) => role === "owner" || role === "admin" || role === "agronomist";

interface PlanDraft {
  crop: string;
  variety: string;
  sowing: string;
  density: string;
  unit: string;
  target: string;
}

const planText = (p: PlanLite | undefined): string => {
  if (!p) return t("ui.seasonPlanEmpty");
  const parts = [
    p.crop ? t(k(`fields.crop_${p.crop}`)) : null,
    p.variety,
    p.plannedSowingDate ? `${t("ui.seasonPlannedSowing")} ${isoToDisplay(p.plannedSowingDate)}` : null,
    p.sowingDensity !== null && p.densityUnit ? `${fmtNumber(p.sowingDensity, 1)} ${t(k(`fields.densityUnit_${p.densityUnit}`))}` : null,
    p.targetYieldTHa !== null ? `${fmtNumber(p.targetYieldTHa, 1)} t/ha` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t("ui.seasonPlanEmpty");
};

export default function Seasons() {
  const role = useSession()?.organization.role;
  const canEdit = !!role && !isFieldRole(role) && can(role);
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const data = useLocal(() => {
    const db = getDb();
    return { seasons: localSeasons(db), plans: localPlans(db), plots: db.plots() };
  });
  const [picked, setPicked] = useState<string | null>(null);
  const season = data.seasons.find((s) => s.id === picked) ?? data.seasons.find((s) => s.active) ?? data.seasons[0] ?? null;
  const plots = useMemo(() => data.plots.filter((p) => p.kind === "crop" && (!farm || p.farmId === farm.id)), [data.plots, farm]);
  const planOf = (plotId: string) => (season ? data.plans.find((p) => p.plotId === plotId && p.seasonId === season.id) : undefined);

  const [creating, setCreating] = useState<{ name: string; start: string; end: string } | null>(null);
  const [planning, setPlanning] = useState<{ plotId: string; name: string; draft: PlanDraft } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/seasons");
  const toggle = useOnlineMutation<{ id: string; active: boolean }, { ok: boolean }>("PATCH", (b) => `/org/seasons/${b.id}`);
  const remove = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/seasons/${b.id}`);
  const savePlan = useOnlineMutation<Record<string, unknown> & { seasonId: string; plotId: string }, { ok: boolean }>("PUT", (b) => `/org/seasons/${b.seasonId}/plots/${b.plotId}`);
  const clearPlan = useOnlineMutation<{ seasonId: string; plotId: string }, { ok: boolean }>("DELETE", (b) => `/org/seasons/${b.seasonId}/plots/${b.plotId}`);

  const done = (msg: MessageKey) => {
    showToast(t(msg));
    void syncNow();
  };

  const submitCreate = async () => {
    if (!creating) return;
    const name = creating.name.trim();
    if (!name) return setFormError(t("office.seasonNeedsName"));
    if (creating.start && creating.end && creating.end < creating.start) return setFormError(t("office.seasonEndBeforeStart"));
    setFormError(null);
    const r = await create.mutate({ name, startDate: creating.start || null, endDate: creating.end || null, active: true });
    if (r.ok) {
      setPicked(r.data.id);
      setCreating(null);
      done("ui.toastSeasonSaved");
    }
  };

  const openPlan = (plot: (typeof plots)[number]) => {
    const p = planOf(plot.id);
    savePlan.reset();
    clearPlan.reset();
    setFormError(null);
    setPlanning({ plotId: plot.id, name: plot.name, draft: { crop: p?.crop ?? plot.crop ?? "", variety: p?.variety ?? "", sowing: p?.plannedSowingDate ?? "", density: p?.sowingDensity != null ? String(p.sowingDensity).replace(".", ",") : "", unit: p?.densityUnit ?? "kg_ha", target: p?.targetYieldTHa != null ? String(p.targetYieldTHa).replace(".", ",") : "" } });
  };

  const submitPlan = async () => {
    if (!planning || !season) return;
    const d = planning.draft;
    const density = d.density.trim() ? parseDecimal(d.density) : null;
    const target = d.target.trim() ? parseDecimal(d.target) : null;
    if ((density !== null && density <= 0) || (target !== null && target <= 0) || (d.density.trim() && density === null) || (d.target.trim() && target === null)) return setFormError(t("office.seasonBadNumber"));
    setFormError(null);
    const r = await savePlan.mutate({ seasonId: season.id, plotId: planning.plotId, crop: d.crop || null, variety: d.variety.trim() || null, plannedSowingDate: d.sowing || null, sowingDensity: density, densityUnit: density !== null ? d.unit : null, targetYieldTHa: target });
    if (r.ok) {
      setPlanning(null);
      done("ui.toastSeasonPlanSaved");
    }
  };

  const removePlan = async () => {
    if (!planning || !season) return;
    const r = await clearPlan.mutate({ seasonId: season.id, plotId: planning.plotId });
    if (r.ok) {
      setPlanning(null);
      done("ui.toastSeasonPlanSaved");
    }
  };

  const withPlan = plots.filter((p) => planOf(p.id)).length;
  const planArea = plots.filter((p) => planOf(p.id)).reduce((a, p) => a + p.areaHa, 0);
  const set = (patch: Partial<PlanDraft>) => setPlanning((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p));
  const mutErr = formError ?? savePlan.error ?? clearPlan.error;

  return (
    <OfficeScreen title={t("ui.seasonsTitle")} action={canEdit ? { label: t("ui.seasonNew"), icon: Plus, onPress: () => { create.reset(); setFormError(null); setCreating({ name: "", start: "", end: "" }); } } : undefined}>
      {data.seasons.length === 0 ? (
        <EmptyState title={t("office.seasonsEmpty")} hint={canEdit ? t("ui.seasonNone") : t("office.seasonsEmptyView")} />
      ) : (
        <>
          <FilterChips value={season?.id ?? ""} onChange={setPicked} options={data.seasons.map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name} · ${t("ui.seasonClosed")}` }))} />
          {season && (
            <>
              <Text style={[T.small, { marginTop: 12 }]}>
                {[season.active ? t("ui.seasonActive") : t("ui.seasonClosed"), season.startDate || season.endDate ? `${season.startDate ? isoToDisplay(season.startDate) : "—"} → ${season.endDate ? isoToDisplay(season.endDate) : "—"}` : null].filter(Boolean).join(" · ")}
              </Text>
              <FarmChips farms={farms} value={farm?.id} onChange={setFarmId} />
              {plots.length > 0 && withPlan > 0 && (
                <StatRow items={[{ label: t("office.seasonsWithPlan"), value: `${withPlan}/${plots.length}` }, { label: t("office.seasonsPlanArea"), value: fmtNumber(haToArea(planArea, units.area), 0), unit: areaLabel(units.area) }]} />
              )}
              <SectionHeader title={t("ui.seasonPlanTitle")} />
              <DataList
                rows={plots}
                keyOf={(p) => p.id}
                title={(p) => p.name}
                subtitle={(p) => planText(planOf(p.id))}
                onPress={canEdit ? openPlan : undefined}
                empty={{ title: t("ui.noPlots") }}
              />
              {canEdit && (
                <>
                  <SectionHeader title={t("office.seasonManage")} />
                  <Row title={season.active ? t("ui.seasonClose") : t("ui.seasonReopen")} subtitle={season.active ? t("office.seasonCloseHint") : undefined} chevron onPress={() => void toggle.mutate({ id: season.id, active: !season.active }).then((r) => r.ok && done("ui.toastSeasonSaved"))} />
                  <Row title={t("ui.seasonDelete")} tone="danger" onPress={() => { remove.reset(); setConfirmDelete(true); }} />
                  {toggle.error ? (
                    <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 8 }]}>
                      {toggle.error}
                    </Text>
                  ) : null}
                </>
              )}
            </>
          )}
        </>
      )}

      <FormSheet visible={!!creating} title={t("ui.seasonNew")} onClose={() => setCreating(null)} onSubmit={submitCreate} submitLabel={t("ui.save")} pending={create.pending} error={formError ?? create.error}>
        {creating ? (
          <>
            <TextField label={t("ui.seasonName")} placeholder={t("ui.seasonNamePlaceholder")} value={creating.name} onChangeText={(v) => setCreating({ ...creating, name: v })} maxLength={80} />
            <DateField label={t("ui.seasonStart")} value={creating.start} onChange={(v) => setCreating({ ...creating, start: v })} />
            <DateField label={t("ui.seasonEnd")} value={creating.end} onChange={(v) => setCreating({ ...creating, end: v })} />
          </>
        ) : null}
      </FormSheet>

      <FormSheet visible={!!planning} title={planning && season ? `${planning.name} · ${season.name}` : ""} onClose={() => setPlanning(null)} onSubmit={submitPlan} submitLabel={t("ui.seasonPlanSave")} pending={savePlan.pending} error={mutErr}>
        {planning ? (
          <>
            <SelectField label={t("ui.crop")} value={planning.draft.crop} options={[{ value: "", label: t("ui.none") }, ...CROPS.map((c) => ({ value: c as string, label: t(k(`fields.crop_${c}`)) }))]} onChange={(v) => set({ crop: v })} />
            <TextField label={t("ui.seasonVariety")} value={planning.draft.variety} onChangeText={(v) => set({ variety: v })} maxLength={80} />
            <DateField label={t("ui.seasonPlannedSowing")} value={planning.draft.sowing} onChange={(v) => set({ sowing: v })} />
            <TextField label={t("ui.seasonDensity")} kind="decimal" value={planning.draft.density} onChangeText={(v) => set({ density: v })} />
            <SelectField label={t("ui.seasonDensityUnit")} value={planning.draft.unit} options={DENSITY_UNITS.map((u) => ({ value: u as string, label: t(k(`fields.densityUnit_${u}`)) }))} onChange={(v) => set({ unit: v })} />
            <TextField label={t("ui.seasonTargetYield")} kind="decimal" value={planning.draft.target} onChangeText={(v) => set({ target: v })} />
            {planOf(planning.plotId) ? <Button kind="text" title={t("ui.seasonPlanClear")} loading={clearPlan.pending} onPress={() => void removePlan()} style={{ marginTop: 8 }} /> : null}
          </>
        ) : null}
      </FormSheet>

      <Sheet visible={confirmDelete} title={t("ui.seasonDelete")} onClose={() => setConfirmDelete(false)}>
        {season ? (
          <>
            <Text style={T.body}>{t("ui.seasonConfirmDelete", { name: season.name })}</Text>
            {remove.error ? (
              <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
                {remove.error}
              </Text>
            ) : null}
            <Button
              kind="danger"
              title={t("ui.delete")}
              loading={remove.pending}
              onPress={() =>
                void remove.mutate({ id: season.id }).then((r) => {
                  if (r.ok) {
                    setConfirmDelete(false);
                    setPicked(null);
                    done("ui.toastSeasonDeleted");
                  }
                })
              }
              style={{ marginTop: 16 }}
            />
            <Button kind="text" title={t("ui.cancel")} onPress={() => setConfirmDelete(false)} style={{ marginTop: 4 }} />
          </>
        ) : null}
      </Sheet>
    </OfficeScreen>
  );
}
