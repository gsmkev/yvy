/** Depósitos (función 114): lista, alta y edición. /org/erp/warehouses (los ve también el agrónomo; edita dueño y administrador). */
import { useState } from "react";
import { Plus } from "lucide-react-native";
import { WAREHOUSE_TYPES, t } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { showToast } from "../../../src/lib/toast";
import { useLocal } from "../../../src/lib/useLocal";
import { AdminGate, k, useAdminAccess, useFarmNames, useWarehouses, type WarehouseRow } from "../../../src/office/adminKit";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DataList, FormSheet, SelectField, TextField } from "../../../src/office/ui";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";

type WType = (typeof WAREHOUSE_TYPES)[number];
interface Draft {
  id: string | null;
  farmId: string;
  name: string;
  type: WType;
}

export default function Warehouses() {
  const { manage } = useAdminAccess();
  const q = useWarehouses();
  const farms = useLocal(() => getDb().farms());
  const farmName = useFarmNames();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/warehouses", { invalidate: ["/org/erp"] });
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/erp/warehouses/${b.id}`, { invalidate: ["/org/erp"] });
  const noSignal = useNoSignalReason();
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const open = (w: WarehouseRow | null) => {
    if (!manage) return;
    setFormError(null);
    create.reset();
    edit.reset();
    setDraft(w ? { id: w.id, farmId: w.farmId, name: w.name, type: w.type } : { id: null, farmId: farms[0]?.id ?? "", name: "", type: "shed" });
  };

  const submit = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setFormError(t("office.admNeedsName"));
    if (!draft.farmId) return setFormError(t("office.admNeedsFarm"));
    setFormError(null);
    const body = { farmId: draft.farmId, name, type: draft.type };
    const r = draft.id ? await edit.mutate({ id: draft.id, ...body }) : await create.mutate(body);
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erpSaved"));
    }
  };

  const err = formError ?? (draft?.id ? edit.error : create.error);
  return (
    <AdminGate need="stock" title={t("ui.adminSection_warehouses")}>
      <OfficeScreen title={t("ui.adminSection_warehouses")} query={q} action={manage ? { label: t("ui.warehouseNew"), icon: Plus, onPress: () => open(null), disabled: !!noSignal } : undefined}>
        {manage ? <NoSignalNote /> : null}
        <OnlineState query={q} empty={{ title: t("ui.emptyWarehousesTitle"), hint: t("ui.emptyWarehousesBody") }}>
          {(rows) => (
            <DataList
              rows={rows}
              keyOf={(w) => w.id}
              title={(w) => w.name}
              subtitle={(w) => [t(k(`ui.warehouseType_${w.type}`)), farmName.get(w.farmId), w.isDefault ? t("office.admDefault") : null].filter(Boolean).join(" · ")}
              onPress={manage ? open : undefined}
              empty={{ title: t("ui.erpEmpty") }}
            />
          )}
        </OnlineState>
        <FormSheet visible={!!draft} title={draft?.id ? t("ui.erpEdit") : t("ui.warehouseNew")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.save")} pending={create.pending || edit.pending} error={err}>
          <TextField label={t("ui.warehouseName")} value={draft?.name ?? ""} onChangeText={(v) => set({ name: v })} maxLength={80} />
          <SelectField<WType> label={t("ui.warehouseType")} value={draft?.type} options={WAREHOUSE_TYPES.map((v) => ({ value: v, label: t(k(`ui.warehouseType_${v}`)) }))} onChange={(v) => set({ type: v })} />
          <SelectField label={t("ui.warehouseFarm")} value={draft?.farmId} options={farms.map((f) => ({ value: f.id, label: f.name }))} onChange={(v) => set({ farmId: v })} />
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
