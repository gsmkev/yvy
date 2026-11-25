/** Tarjeta de un campo propio de un formulario: etiqueta, tipo, unidad u opciones y si es obligatorio. */
import { FORM_FIELD_TYPES, LIMITS, type FormField } from "@yvy/shared";
import { Field, Input, Select } from "../../components/ui";
import { t } from "../../lib/i18n";

/** Props de FieldCard: `n` es el número del campo, `saved` si ya estaba guardado (su id no cambia) y `onChange` recibe los cambios. */
interface FieldCardProps {
  field: FormField;
  n: number;
  saved: boolean;
  canEdit: boolean;
  idFor: (label: string) => string;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
}

/** Un campo de la lista; si no se puede editar, solo se lee. */
export function FieldCard({ field: f, n, saved, canEdit, idFor, onChange, onRemove }: FieldCardProps) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-linea p-3">
      <legend className="px-1 text-xs text-tinta-2">{t("ui.forms.fieldN", { n })}</legend>
      <Field label={t("ui.forms.label")}>
        <Input
          value={f.label}
          maxLength={LIMITS.forms.maxLabel}
          disabled={!canEdit}
          placeholder={t("ui.forms.labelPlaceholder")}
          onChange={(e) => onChange({ label: e.target.value, id: saved ? f.id : idFor(e.target.value) })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("ui.forms.type")}>
          <Select value={f.type} disabled={!canEdit} onChange={(e) => onChange({ type: e.target.value as FormField["type"] })} options={FORM_FIELD_TYPES.map((ty) => ({ value: ty, label: t(`ui.forms.type_${ty}`) }))} />
        </Field>
        {f.type === "number" && (
          <Field label={t("ui.forms.unit")}>
            <Input value={f.unit ?? ""} maxLength={12} disabled={!canEdit} onChange={(e) => onChange({ unit: e.target.value })} />
          </Field>
        )}
      </div>
      {f.type === "choice" && (
        <Field label={t("ui.forms.options")} hint={t("ui.forms.optionsHint", { max: LIMITS.forms.maxOptions })}>
          <textarea
            className="min-h-20 rounded-md border border-linea bg-papel px-3 py-2 text-body"
            disabled={!canEdit}
            value={(f.options ?? []).join("\n")}
            onChange={(e) => onChange({ options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, LIMITS.forms.maxOptions) })}
          />
        </Field>
      )}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!f.required} disabled={!canEdit} onChange={(e) => onChange({ required: e.target.checked })} />
          {t("ui.forms.required")}
        </label>
        {canEdit && (
          <button className="cursor-pointer text-sm text-peligro underline underline-offset-2" onClick={onRemove}>
            {t("ui.forms.remove")}
          </button>
        )}
      </div>
    </fieldset>
  );
}
