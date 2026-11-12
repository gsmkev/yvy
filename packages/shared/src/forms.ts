/**
 * Formularios configurables por la organización (F-14): campos propios por tipo de registro.
 * La definición se arma en la web (dueño y administrador) y baja al celular, que los pregunta después de las
 * preguntas estándar. Las respuestas van en `data.extra` del registro, validadas con un esquema genérico (las
 * claves son los ids de los campos), así el Worker no necesita conocer cada formulario.
 */
import { z } from "zod";
import { t } from "./i18n";
import { LIMITS } from "./limits";
import { RECORD_KINDS, type RecordKind } from "./schema";

export const FORM_FIELD_TYPES = ["text", "number", "choice", "yesno"] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Id del campo: minúsculas, números y guion bajo; es la clave en `extra`. */
export const FIELD_ID = /^[a-z][a-z0-9_]{0,31}$/;

export const formFieldSchema = z
  .object({
    id: z.string().regex(FIELD_ID),
    label: z.string().trim().min(1).max(LIMITS.forms.maxLabel),
    type: z.enum(FORM_FIELD_TYPES),
    /** Unidad del número (kg, cm, …). */
    unit: z.string().trim().max(12).optional(),
    options: z.array(z.string().trim().min(1).max(LIMITS.forms.maxOptionLength)).min(2).max(LIMITS.forms.maxOptions).optional(),
    required: z.boolean().optional(),
  })
  .refine((f) => (f.type === "choice" ? !!f.options && new Set(f.options).size === f.options.length : true), {
    message: "Una pregunta de opciones necesita al menos 2 opciones distintas",
  });
export type FormField = z.infer<typeof formFieldSchema>;

export const formConfigSchema = z
  .partialRecord(z.enum(RECORD_KINDS), z.array(formFieldSchema).max(LIMITS.forms.maxFieldsPerKind))
  .superRefine((cfg, ctx) => {
    for (const [kind, fields] of Object.entries(cfg)) {
      const ids = fields.map((f) => f.id);
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: `Ids repetidos en ${kind}` });
    }
  });
export type FormConfig = Partial<Record<RecordKind, FormField[]>>;

/** Respuestas propias de un registro: id del campo → valor. Esquema genérico, sin conocer la configuración. */
export const extraSchema = z
  .record(
    z.string().regex(FIELD_ID),
    z.union([z.string().trim().max(LIMITS.forms.maxTextLength), z.number().finite().min(-1e12).max(1e12), z.boolean()]),
  )
  .refine((e) => Object.keys(e).length <= LIMITS.forms.maxFieldsPerKind, { message: "Demasiados campos propios" });
export type Extra = z.infer<typeof extraSchema>;

/** Prefijo con que el flujo del celular guarda las respuestas propias entre las demás (`extra.<id>`). */
export const EXTRA_PREFIX = "extra.";

/** Separa las respuestas `extra.<id>` del resto y arma `extra`; vacías quedan afuera. */
export function splitExtraAnswers(values: Record<string, unknown>): { rest: Record<string, unknown>; extra: Extra | undefined } {
  const rest: Record<string, unknown> = {};
  const extra: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k.startsWith(EXTRA_PREFIX)) {
      if (v !== undefined && v !== null && v !== "") extra[k.slice(EXTRA_PREFIX.length)] = v as string | number | boolean;
    } else if (k !== "extra") rest[k] = v;
  }
  return { rest, extra: Object.keys(extra).length ? extra : undefined };
}

/** Al revés: lleva `data.extra` a claves `extra.<id>` para precargar el flujo al editar. */
export function flattenExtra(data: Record<string, unknown>): Record<string, unknown> {
  const { extra, ...rest } = data;
  const out: Record<string, unknown> = { ...rest };
  if (extra && typeof extra === "object") for (const [k, v] of Object.entries(extra)) out[`${EXTRA_PREFIX}${k}`] = v;
  return out;
}

/** Valor de una respuesta como texto legible (para el detalle del registro). */
export function describeExtraValue(f: FormField, v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (f.type === "yesno") return v === true ? t("ui.yes") : t("ui.no");
  if (f.type === "number") return f.unit ? `${v} ${f.unit}` : String(v);
  return String(v);
}

/** Respuestas con la etiqueta del campo: las que ya no tienen definición se muestran con su id. */
export function describeExtra(fields: FormField[] | undefined, extra: Extra | undefined): { label: string; value: string }[] {
  if (!extra) return [];
  const byId = new Map((fields ?? []).map((f) => [f.id, f]));
  const known = (fields ?? []).filter((f) => extra[f.id] !== undefined).map((f) => ({ label: f.label, value: describeExtraValue(f, extra[f.id]) }));
  const unknown = Object.entries(extra)
    .filter(([id]) => !byId.has(id))
    .map(([id, v]) => ({ label: id, value: String(v) }));
  return [...known, ...unknown].filter((x) => x.value !== "");
}

/** ¿Falta alguna respuesta obligatoria? Devuelve los campos que faltan (para la app y las pruebas). */
export function missingRequired(fields: FormField[] | undefined, extra: Extra | undefined): FormField[] {
  return (fields ?? []).filter((f) => f.required && (extra?.[f.id] === undefined || extra[f.id] === ""));
}
