/** Proveedores y clientes (función 116): lista, alta y edición. /org/erp/parties (solo dueño y administrador). */
import { useState } from "react";
import { Plus } from "lucide-react-native";
import { PARTY_KINDS, partyInput, t } from "@yvy/shared";
import { showToast } from "../../../src/lib/toast";
import { AdminGate, k, useParties, type Party } from "../../../src/office/adminKit";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DataList, FilterChips, FormSheet, SelectField, TextField } from "../../../src/office/ui";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";

type Kind = (typeof PARTY_KINDS)[number];
interface Draft {
  id: string | null;
  name: string;
  ruc: string;
  kind: Kind;
  phone: string;
  email: string;
  address: string;
  note: string;
}
const blank: Draft = { id: null, name: "", ruc: "", kind: "supplier", phone: "", email: "", address: "", note: "" };
const kindOptions = () => PARTY_KINDS.map((v) => ({ value: v, label: t(k(`ui.party.kind_${v}`)) }));

export default function Parties() {
  const q = useParties();
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/parties", { invalidate: ["/org/erp"] });
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/erp/parties/${b.id}`, { invalidate: ["/org/erp"] });
  const noSignal = useNoSignalReason();
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const open = (p: Party | null) => {
    setFormError(null);
    create.reset();
    edit.reset();
    setDraft(p ? { id: p.id, name: p.name, ruc: p.ruc ?? "", kind: p.kind, phone: p.phone ?? "", email: p.email ?? "", address: p.address ?? "", note: p.note ?? "" } : { ...blank });
  };

  const submit = async () => {
    if (!draft) return;
    const body = {
      name: draft.name.trim(),
      ruc: draft.ruc.trim() || null,
      kind: draft.kind,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      address: draft.address.trim() || null,
      note: draft.note.trim() || null,
    };
    if (!body.name) return setFormError(t("office.adm.partyNeedsName"));
    const check = partyInput.safeParse(body);
    if (!check.success) return setFormError(check.error.issues[0]?.path[0] === "ruc" ? t("ui.party.rucHint") : t("office.adm.checkFields"));
    setFormError(null);
    const r = draft.id ? await edit.mutate({ id: draft.id, ...body }) : await create.mutate(body);
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erp.saved"));
    }
  };

  const rows = (q.data ?? []).filter((p) => filter === "all" || p.kind === filter || p.kind === "both");
  const err = formError ?? (draft?.id ? edit.error : create.error);

  return (
    <AdminGate need="manage" title={t("ui.admin.section_parties")}>
      <OfficeScreen title={t("ui.admin.section_parties")} query={q} action={{ label: t("ui.party.new"), icon: Plus, onPress: () => open(null), disabled: !!noSignal }}>
        <NoSignalNote />
        <OnlineState query={q} empty={{ title: t("ui.empty.partiesTitle"), hint: t("ui.empty.partiesBody") }}>
          {(all) => (
            <>
              <FilterChips<"all" | Kind>
                value={filter}
                onChange={setFilter}
                options={[{ value: "all", label: t("ui.cost.all"), count: all.length }, { value: "supplier", label: t("ui.party.kind_supplier") }, { value: "customer", label: t("ui.party.kind_customer") }]}
              />
              <DataList
                rows={rows}
                keyOf={(p) => p.id}
                title={(p) => p.name}
                subtitle={(p) => [t(k(`ui.party.kind_${p.kind}`)), p.ruc, p.phone].filter(Boolean).join(" · ")}
                onPress={open}
                empty={{ title: t("ui.erp.empty") }}
              />
            </>
          )}
        </OnlineState>
        <FormSheet visible={!!draft} title={draft?.id ? t("ui.erp.edit") : t("ui.party.new")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={create.pending || edit.pending} error={err}>
          <TextField label={t("ui.party.name")} value={draft?.name ?? ""} onChangeText={(v) => set({ name: v })} maxLength={120} />
          <SelectField<Kind> label={t("ui.party.kind")} value={draft?.kind} options={kindOptions()} onChange={(v) => set({ kind: v })} />
          <TextField label={t("ui.party.ruc")} hint={t("ui.party.rucHint")} value={draft?.ruc ?? ""} onChangeText={(v) => set({ ruc: v })} maxLength={12} autoCapitalize="none" />
          <TextField label={t("ui.party.phone")} value={draft?.phone ?? ""} onChangeText={(v) => set({ phone: v })} maxLength={40} />
          <TextField label={t("ui.party.email")} value={draft?.email ?? ""} onChangeText={(v) => set({ email: v })} maxLength={120} autoCapitalize="none" />
          <TextField label={t("ui.party.address")} value={draft?.address ?? ""} onChangeText={(v) => set({ address: v })} maxLength={200} />
          <TextField label={t("ui.party.note")} value={draft?.note ?? ""} onChangeText={(v) => set({ note: v })} maxLength={500} kind="multiline" />
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
