/** Formularios configurables (F-14): campos propios que cada tipo de registro pregunta después de las preguntas estándar. */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FORM_FIELD_TYPES, FIELD_ID, LIMITS, RECORD_KINDS, formConfigSchema, type FormConfig, type FormField, type RecordKind } from "@yvy/shared";
import { Button, Empty, ErrorBox, Field, Input, Select, Spinner, toast } from "../components/ui";
import { get, put } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";

/** Id a partir de la etiqueta ("Altura de plantas" -> altura_de_plantas), único entre los campos del tipo. */
export function fieldIdFrom(label: string, taken: string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "c_$1")
      .slice(0, 28) || "campo";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return FIELD_ID.test(id) ? id : "campo";
}

const blank = (taken: string[]): FormField => ({ id: fieldIdFrom("campo", taken), label: "", type: "text" });

export function FormsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["form-config"], queryFn: () => get<{ config: FormConfig }>("/org/form-config") });
  const [cfg, setCfg] = useState<FormConfig>({});
  const [kind, setKind] = useState<RecordKind>("scouting");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setCfg(q.data.config);
  }, [q.data]);
  const save = useMutation({
    mutationFn: (c: FormConfig) => put("/org/form-config", c),
    onSuccess: () => {
      toast(t("ui.formsSaved"));
      void qc.invalidateQueries({ queryKey: ["form-config"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("ui.formsInvalid")),
  });
  if (q.isLoading || me.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const canEdit = me.data?.role === "owner" || me.data?.role === "admin";
  const fields = cfg[kind] ?? [];
  const setFields = (list: FormField[]) => {
    setError(null);
    setCfg({ ...cfg, [kind]: list });
  };
  const patch = (i: number, p: Partial<FormField>) => setFields(fields.map((f, k) => (k === i ? { ...f, ...p } : f)));
  const trySave = () => {
    // Los ids se fijan al guardar a partir de la etiqueta de los campos nuevos; los ya guardados no cambian
    const clean: FormConfig = {};
    for (const k of RECORD_KINDS) {
      const list = (cfg[k] ?? []).filter((f) => f.label.trim());
      if (list.length) clean[k] = list.map((f) => (f.type === "choice" ? f : { ...f, options: undefined })).map((f) => (f.unit ? f : { ...f, unit: undefined }));
    }
    const ok = formConfigSchema.safeParse(JSON.parse(JSON.stringify(clean)));
    if (!ok.success) return setError(ok.error.issues[0]?.message ?? t("ui.formsInvalid"));
    save.mutate(ok.data);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <Link to="/equipo" className="text-sm text-tinta-2 underline underline-offset-2">
          {t("ui.formsBack")}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{t("ui.formsTitle")}</h1>
        <p className="mt-1 text-sm text-tinta-2">{t("ui.formsIntro", { max: LIMITS.forms.maxFieldsPerKind })}</p>
      </div>
      <Field label={t("ui.formsKind")}>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as RecordKind)}
          options={RECORD_KINDS.map((k) => ({ value: k, label: `${tk(`recordKinds.${k}`)}${(cfg[k]?.length ?? 0) > 0 ? ` (${cfg[k]!.length})` : ""}` }))}
        />
      </Field>
      {fields.length === 0 && <Empty>{t("ui.formsNone")}</Empty>}
      {fields.map((f, i) => (
        <fieldset key={f.id} className="flex flex-col gap-3 rounded-lg border border-linea p-3">
          <legend className="px-1 text-xs text-tinta-2">{t("ui.formsFieldN", { n: i + 1 })}</legend>
          <Field label={t("ui.formsLabel")}>
            <Input
              value={f.label}
              maxLength={LIMITS.forms.maxLabel}
              disabled={!canEdit}
              placeholder={t("ui.formsLabelPlaceholder")}
              onChange={(e) => patch(i, { label: e.target.value, id: q.data?.config[kind]?.some((x) => x.id === f.id) ? f.id : fieldIdFrom(e.target.value, fields.filter((_, k) => k !== i).map((x) => x.id)) })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("ui.formsType")}>
              <Select
                value={f.type}
                disabled={!canEdit}
                onChange={(e) => patch(i, { type: e.target.value as FormField["type"] })}
                options={FORM_FIELD_TYPES.map((ty) => ({ value: ty, label: t(`ui.formsType_${ty}`) }))}
              />
            </Field>
            {f.type === "number" && (
              <Field label={t("ui.formsUnit")}>
                <Input value={f.unit ?? ""} maxLength={12} disabled={!canEdit} onChange={(e) => patch(i, { unit: e.target.value })} />
              </Field>
            )}
          </div>
          {f.type === "choice" && (
            <Field label={t("ui.formsOptions")} hint={t("ui.formsOptionsHint", { max: LIMITS.forms.maxOptions })}>
              <textarea
                className="min-h-20 rounded-md border border-linea bg-papel px-3 py-2 text-[15px]"
                disabled={!canEdit}
                value={(f.options ?? []).join("\n")}
                onChange={(e) => patch(i, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, LIMITS.forms.maxOptions) })}
              />
            </Field>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!f.required} disabled={!canEdit} onChange={(e) => patch(i, { required: e.target.checked })} />
              {t("ui.formsRequired")}
            </label>
            {canEdit && (
              <button className="cursor-pointer text-sm text-peligro underline underline-offset-2" onClick={() => setFields(fields.filter((_, k) => k !== i))}>
                {t("ui.formsRemove")}
              </button>
            )}
          </div>
        </fieldset>
      ))}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={fields.length >= LIMITS.forms.maxFieldsPerKind} onClick={() => setFields([...fields, blank(fields.map((f) => f.id))])}>
            {t("ui.formsAdd")}
          </Button>
          <Button variant="primary" disabled={save.isPending} onClick={trySave}>
            {t("ui.formsSave")}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-peligro">{error}</p>}
      <p className="text-xs text-tinta-2">{t("ui.formsNote")}</p>
    </div>
  );
}
