/** Hojas del catálogo de productos: formulario de alta y edición, y confirmación de borrado. */
import { PRODUCT_TYPES, PRODUCT_UNITS, t, type MessageKey } from "@yvy/shared";
import { Button, Text } from "../../ui/kit";
import { T } from "../../ui/theme";
import { ConfirmDeleteSheet, FormSheet, SelectField, TextField } from "../ui";
import { doseUnit, type Draft } from "./draft";
import type { useProductEditor } from "./useProductEditor";

type Editor = ReturnType<typeof useProductEditor>;

const k = (s: string) => s as MessageKey;

/** Formulario del producto (con su dosis habitual); el botón de borrar solo aparece al editar. */
export function ProductFormSheet({ editor, onDelete }: { editor: Editor; onDelete: (id: string) => void }) {
  const { draft, set } = editor;
  return (
    <FormSheet visible={!!draft} title={draft?.id ? t("office.product.editTitle") : t("ui.product.new")} onClose={editor.close} onSubmit={editor.submit} submitLabel={t("ui.common.save")} pending={editor.pending} error={editor.error}>
      {draft ? (
        <>
          <ProductFields draft={draft} set={set} />
          {draft.id ? <Button kind="text" title={t("office.product.delete")} onPress={() => onDelete(draft.id!)} style={{ marginTop: 8 }} /> : null}
        </>
      ) : null}
    </FormSheet>
  );
}

function ProductFields({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  return (
    <>
      <TextField label={t("ui.product.name")} value={draft.name} onChangeText={(v) => set({ name: v })} maxLength={120} />
      <SelectField label={t("ui.product.type")} value={draft.type} options={PRODUCT_TYPES.map((x) => ({ value: x as string, label: t(k(`fields.product.type_${x}`)) }))} onChange={(v) => set({ type: v })} />
      <SelectField label={t("ui.product.unit")} value={draft.unit} options={PRODUCT_UNITS.map((x) => ({ value: x as string, label: t(k(`fields.product.unit_${x}`)) }))} onChange={(v) => set({ unit: v })} />
      <TextField label={t("ui.product.activeIngredient")} value={draft.ingredient} onChangeText={(v) => set({ ingredient: v })} maxLength={120} />
      <TextField label={t("ui.product.withdrawal")} kind="number" value={draft.withdrawal} onChangeText={(v) => set({ withdrawal: v.replace(/\D/g, "") })} />
      <TextField label={t("ui.product.toxClass")} value={draft.tox} onChangeText={(v) => set({ tox: v })} maxLength={40} />
      <Text style={[T.heading, { marginTop: 24 }]}>{t("ui.product.doseTitle")}</Text>
      <Text style={[T.small, { marginTop: 4 }]}>{t("ui.product.doseHint")}</Text>
      <TextField label={t("ui.product.doseMin", { unit: doseUnit(draft.unit) })} kind="decimal" value={draft.doseMin} onChangeText={(v) => set({ doseMin: v })} />
      <TextField label={t("ui.product.doseMax", { unit: doseUnit(draft.unit) })} kind="decimal" value={draft.doseMax} onChangeText={(v) => set({ doseMax: v })} />
    </>
  );
}

/** Confirmación para borrar el producto elegido. */
export function RemoveProductSheet({ editor }: { editor: Editor }) {
  const { removing, removeState } = editor;
  return (
    <ConfirmDeleteSheet
      visible={!!removing}
      title={t("office.product.delete")}
      message={removing ? t("ui.product.confirmDelete", { name: removing.name }) : ""}
      error={removeState.error}
      pending={removeState.pending}
      onConfirm={() => removing && void editor.confirmRemove(removing)}
      onCancel={editor.cancelRemove}
    />
  );
}
