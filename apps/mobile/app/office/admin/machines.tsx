/** Máquinas (función 115): lista, alta y edición. /org/erp/machines (las ve también el agrónomo; edita dueño y administrador). */
import { useState } from "react";
import { Plus } from "lucide-react-native";
import { MACHINE_TYPES, METER_KINDS, t } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { showToast } from "../../../src/lib/toast";
import { useLocal } from "../../../src/lib/useLocal";
import { AdminGate, k, useAdminAccess, useFarmNames } from "../../../src/office/adminKit";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { fmtNumber, parseDecimal } from "../../../src/office/format";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DataList, FormSheet, SelectField, TextField } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";

type MType = (typeof MACHINE_TYPES)[number];
type Meter = (typeof METER_KINDS)[number];
interface Machine {
  id: string;
  farmId: string | null;
  name: string;
  type: MType;
  brand: string | null;
  model: string | null;
  year: number | null;
  meterKind: Meter;
  meterValue: number;
}
interface Draft {
  id: string | null;
  name: string;
  type: MType;
  brand: string;
  model: string;
  year: string;
  meterKind: Meter;
  meterValue: string;
  farmId: string;
}

export default function Machines() {
  const { manage } = useAdminAccess();
  const q = useOnline<Machine[]>("/org/erp/machines");
  const farms = useLocal(() => getDb().farms());
  const farmName = useFarmNames();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/machines", { invalidate: ["/org/erp"] });
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/erp/machines/${b.id}`, { invalidate: ["/org/erp"] });
  const noSignal = useNoSignalReason();
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const open = (m: Machine | null) => {
    if (!manage) return;
    setFormError(null);
    create.reset();
    edit.reset();
    setDraft(
      m
        ? { id: m.id, name: m.name, type: m.type, brand: m.brand ?? "", model: m.model ?? "", year: m.year ? String(m.year) : "", meterKind: m.meterKind, meterValue: String(m.meterValue).replace(".", ","), farmId: m.farmId ?? "" }
        : { id: null, name: "", type: "tractor", brand: "", model: "", year: "", meterKind: "hours", meterValue: "", farmId: "" },
    );
  };

  const submit = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setFormError(t("office.adm.needsName"));
    const year = draft.year.trim() ? Number(draft.year) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100)) return setFormError(t("office.adm.badYear"));
    const meter = draft.meterValue.trim() ? parseDecimal(draft.meterValue) : 0;
    if (meter === null || meter < 0) return setFormError(t("office.adm.badMeter"));
    setFormError(null);
    const body = { name, type: draft.type, brand: draft.brand.trim() || null, model: draft.model.trim() || null, year, meterKind: draft.meterKind, meterValue: meter, farmId: draft.farmId || null };
    const r = draft.id ? await edit.mutate({ id: draft.id, ...body }) : await create.mutate(body);
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erp.saved"));
    }
  };

  const err = formError ?? (draft?.id ? edit.error : create.error);
  return (
    <AdminGate need="stock" title={t("ui.admin.section_machines")}>
      <OfficeScreen title={t("ui.admin.section_machines")} query={q} action={manage ? { label: t("ui.machine.new"), icon: Plus, onPress: () => open(null), disabled: !!noSignal } : undefined}>
        {manage ? <NoSignalNote /> : null}
        <OnlineState query={q} empty={{ title: t("ui.machine.emptyTitle"), hint: t("ui.machine.emptyHint") }}>
          {(rows) => (
            <DataList
              rows={rows}
              keyOf={(m) => m.id}
              title={(m) => m.name}
              subtitle={(m) => [t(k(`ui.machine.type_${m.type}`)), [m.brand, m.model, m.year].filter(Boolean).join(" "), m.farmId ? farmName.get(m.farmId) : null].filter(Boolean).join(" · ")}
              right={(m) => `${fmtNumber(m.meterValue)} ${m.meterKind === "hours" ? "h" : "km"}`}
              onPress={manage ? open : undefined}
              empty={{ title: t("ui.erp.empty") }}
            />
          )}
        </OnlineState>
        <FormSheet visible={!!draft} title={draft?.id ? t("ui.erp.edit") : t("ui.machine.new")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={create.pending || edit.pending} error={err}>
          <TextField label={t("ui.machine.name")} value={draft?.name ?? ""} onChangeText={(v) => set({ name: v })} maxLength={80} />
          <SelectField<MType> label={t("ui.machine.type")} value={draft?.type} options={MACHINE_TYPES.map((v) => ({ value: v, label: t(k(`ui.machine.type_${v}`)) }))} onChange={(v) => set({ type: v })} />
          <TextField label={t("ui.machine.brand")} value={draft?.brand ?? ""} onChangeText={(v) => set({ brand: v })} maxLength={60} />
          <TextField label={t("ui.machine.model")} value={draft?.model ?? ""} onChangeText={(v) => set({ model: v })} maxLength={60} />
          <TextField label={t("ui.machine.year")} value={draft?.year ?? ""} onChangeText={(v) => set({ year: v })} kind="number" maxLength={4} />
          <SelectField<Meter> label={t("ui.machine.meterKind")} value={draft?.meterKind} options={METER_KINDS.map((v) => ({ value: v, label: t(k(`ui.meter.kind_${v}`)) }))} onChange={(v) => set({ meterKind: v })} />
          <TextField label={t("ui.machine.meter")} hint={t("ui.machine.meterHint")} value={draft?.meterValue ?? ""} onChangeText={(v) => set({ meterValue: v })} kind="decimal" />
          <SelectField label={t("ui.machine.farm")} value={draft?.farmId ?? ""} options={[{ value: "", label: t("ui.machine.allFarms") }, ...farms.map((f) => ({ value: f.id, label: f.name }))]} onChange={(v) => set({ farmId: v })} />
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
