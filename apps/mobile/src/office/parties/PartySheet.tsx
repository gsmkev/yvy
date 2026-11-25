/** Formulario de alta y edición de clientes y proveedores. */
import { PARTY_KINDS, t } from "@yvy/shared";
import { k } from "../adminKit";
import { FormSheet, SelectField, TextField } from "../ui";
import type { Kind, PartyEditor } from "./usePartyEditor";

const kindOptions = () => PARTY_KINDS.map((v) => ({ value: v, label: t(k(`ui.party.kind_${v}`)) }));

/** Hoja con los datos de la contraparte; se abre cuando el editor tiene un borrador. */
export function PartySheet({ editor }: { editor: PartyEditor }) {
  const { draft, set } = editor;
  return (
    <FormSheet visible={!!draft} title={draft?.id ? t("ui.erp.edit") : t("ui.party.new")} onClose={editor.close} onSubmit={editor.submit} submitLabel={t("ui.common.save")} pending={editor.pending} error={editor.error}>
      <TextField label={t("ui.party.name")} value={draft?.name ?? ""} onChangeText={(v) => set({ name: v })} maxLength={120} />
      <SelectField<Kind> label={t("ui.party.kind")} value={draft?.kind} options={kindOptions()} onChange={(v) => set({ kind: v })} />
      <TextField label={t("ui.party.ruc")} hint={t("ui.party.rucHint")} value={draft?.ruc ?? ""} onChangeText={(v) => set({ ruc: v })} maxLength={12} autoCapitalize="none" />
      <TextField label={t("ui.party.phone")} value={draft?.phone ?? ""} onChangeText={(v) => set({ phone: v })} maxLength={40} />
      <TextField label={t("ui.party.email")} value={draft?.email ?? ""} onChangeText={(v) => set({ email: v })} maxLength={120} autoCapitalize="none" />
      <TextField label={t("ui.party.address")} value={draft?.address ?? ""} onChangeText={(v) => set({ address: v })} maxLength={200} />
      <TextField label={t("ui.party.note")} value={draft?.note ?? ""} onChangeText={(v) => set({ note: v })} maxLength={500} kind="multiline" />
    </FormSheet>
  );
}
