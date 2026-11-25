/** Formularios configurables: campos propios que cada tipo de registro pregunta después de las preguntas estándar. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LIMITS, RECORD_KINDS, formConfigSchema, type FormConfig, type FormField, type RecordKind } from "@yvy/shared";
import { Button, EmptyState, ErrorBox, Field, Page, Select, Spinner, toast } from "../components/ui";
import { get, put } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { FieldCard } from "./forms/FieldCard";
import { blankField, compactField, fieldIdFrom } from "./forms/fieldId";

export { fieldIdFrom };

/** Configuración guardada y cómo guardar una nueva; `onError` recibe el motivo si el servidor la rechaza. */
function useFormConfig(onError: (message: string) => void) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["form-config"], queryFn: () => get<{ config: FormConfig }>("/org/form-config") });
  const save = useMutation({
    mutationFn: (c: FormConfig) => put("/org/form-config", c),
    onSuccess: () => {
      toast(t("ui.forms.saved"));
      void qc.invalidateQueries({ queryKey: ["form-config"] });
    },
    onError: (e) => onError(e instanceof Error ? e.message : t("ui.forms.invalid")),
  });
  return { q, save };
}

/** Deja solo los campos con etiqueta y los valida; devuelve la configuración o el primer error. */
function cleanConfig(cfg: FormConfig): { config: FormConfig } | { error: string } {
  const clean: FormConfig = {};
  for (const k of RECORD_KINDS) {
    const list = (cfg[k] ?? []).filter((f) => f.label.trim());
    if (list.length) clean[k] = list.map(compactField);
  }
  const ok = formConfigSchema.safeParse(clean);
  return ok.success ? { config: ok.data } : { error: ok.error.issues[0]?.message ?? t("ui.forms.invalid") };
}

/** Campos propios que cada tipo de registro pregunta después de las preguntas estándar. */
export function FormsPage() {
  const me = useMe();
  const [cfg, setCfg] = useState<FormConfig>({});
  const [kind, setKind] = useState<RecordKind>("scouting");
  const [error, setError] = useState<string | null>(null);
  const { q, save } = useFormConfig(setError);
  useEffect(() => {
    if (q.data) setCfg(q.data.config);
  }, [q.data]);
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
    const r = cleanConfig(cfg);
    if ("error" in r) return setError(r.error);
    save.mutate(r.config);
  };
  return (
    <Page width="read" back={{ to: "/equipo", label: t("ui.forms.back") }} title={t("ui.forms.title")}>
      <p className="-mt-2 text-sm text-tinta-2">{t("ui.forms.intro", { max: LIMITS.forms.maxFieldsPerKind })}</p>
      <Field label={t("ui.forms.kind")}>
        <Select value={kind} onChange={(e) => setKind(e.target.value as RecordKind)} options={RECORD_KINDS.map((k) => ({ value: k, label: `${tk(`record-kinds.kind.${k}`)}${(cfg[k]?.length ?? 0) > 0 ? ` (${cfg[k]!.length})` : ""}` }))} />
      </Field>
      {fields.length === 0 && <EmptyState compact title={t("ui.forms.none")} />}
      {fields.map((f, i) => (
        <FieldCard
          key={f.id}
          field={f}
          n={i + 1}
          saved={!!q.data?.config[kind]?.some((x) => x.id === f.id)}
          canEdit={canEdit}
          idFor={(label) => fieldIdFrom(label, fields.filter((_, k) => k !== i).map((x) => x.id))}
          onChange={(p) => patch(i, p)}
          onRemove={() => setFields(fields.filter((_, k) => k !== i))}
        />
      ))}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={fields.length >= LIMITS.forms.maxFieldsPerKind} onClick={() => setFields([...fields, blankField(fields.map((f) => f.id))])}>
            {t("ui.forms.add")}
          </Button>
          <Button variant="primary" disabled={save.isPending} onClick={trySave}>
            {t("ui.forms.save")}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-peligro">{error}</p>}
      <p className="text-xs text-tinta-2">{t("ui.forms.note")}</p>
    </Page>
  );
}
