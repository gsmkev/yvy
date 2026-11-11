/**
 * Edición y borrado de un registro desde la web. Escribe por /sync/push (mismo protocolo que la app):
 * mutación idempotente con UUIDv7; el Worker valida permisos, ventana de edición y datos.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HERD_CATEGORIES,
  MOVE_REASONS,
  newId,
  parseRecordData,
  PESTS,
  PHENO_STAGES,
  RECORD_SCHEMA_VERSION,
  type Mutation,
  type PushResponse,
  type RecordKind,
} from "@yvy/shared";
import { post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import type { RecordRow } from "../lib/types";
import { Button, ConfirmModal, ErrorBox, Field, Input, Select, toast } from "./ui";

type Opt = { value: string; label: string };
type FieldDef =
  | { key: string; label: string; type: "select"; options: Opt[]; optional?: boolean }
  | { key: string; label: string; type: "number" | "text" | "textarea" | "bool"; optional?: boolean };

const f = (k: string) => tk(`fields.${k}`);
const opts = (prefix: string, values: readonly string[]): Opt[] =>
  values.map((v) => ({ value: v, label: f(`${prefix}_${v}`) }));
const CONDITION = opts("condition", ["good", "fair", "bad"]);
const LEVEL = opts("level", ["low", "medium", "high"]);
const NOTE: FieldDef = { key: "note", label: t("app.note"), type: "textarea", optional: true };

/** Cabezas por categoría: una clave con punto por categoría ("counts.vaca"); ver getPath y setPath. */
const HERD_FIELDS = (root: string): FieldDef[] =>
  HERD_CATEGORIES.map((c) => ({ key: `${root}.${c}`, label: f(`herd_${c}`), type: "number", optional: true }));

const FIELDS: Record<RecordKind, FieldDef[]> = {
  scouting: [{ key: "condition", label: f("condition"), type: "select", options: CONDITION }, NOTE],
  pest: [
    { key: "pest", label: f("pest"), type: "select", options: opts("pest", PESTS) },
    { key: "intensity", label: f("intensity"), type: "select", options: LEVEL, optional: true },
    { key: "perMeter", label: f("perMeter"), type: "number", optional: true },
    NOTE,
  ],
  crop_status: [
    { key: "stage", label: f("stage"), type: "select", options: opts("stage", PHENO_STAGES) },
    { key: "condition", label: f("condition"), type: "select", options: CONDITION },
    NOTE,
  ],
  pasture_status: [
    { key: "heightCm", label: f("heightCm"), type: "number" },
    { key: "cover", label: f("cover"), type: "select", options: LEVEL },
    { key: "livestockPresent", label: f("livestockPresent"), type: "bool" },
    NOTE,
  ],
  rain: [{ key: "mm", label: f("mm"), type: "number" }],
  water: [
    {
      key: "level",
      label: f("level"),
      type: "select",
      options: opts("water", ["full", "half", "low", "dry"]),
    },
    NOTE,
  ],
  note: [{ key: "text", label: f("text"), type: "textarea" }],
  // ganaderia
  herd_count: [...HERD_FIELDS("counts"), NOTE],
  herd_move: [
    { key: "reason", label: f("moveReason"), type: "select", options: opts("moveReason", MOVE_REASONS) },
    ...HERD_FIELDS("counts"),
    NOTE,
  ],
};

const getPath = (o: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), o);

/** Pone (o quita, con undefined) un valor en una ruta con puntos, sin tocar el objeto original. */
function setPath(o: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split(".") as [string, ...string[]];
  if (!rest.length) {
    const { [head]: _old, ...others } = o;
    return value === undefined ? others : { ...others, [head]: value };
  }
  const child = o[head] && typeof o[head] === "object" ? (o[head] as Record<string, unknown>) : {};
  return { ...o, [head]: setPath(child, rest.join("."), value) };
}

const toForm = (data: Record<string, unknown>, defs: FieldDef[]) =>
  Object.fromEntries(
    defs.map((d) => {
      const v = getPath(data, d.key);
      return [d.key, d.type === "bool" ? (v === true ? "1" : "0") : v === undefined || v === null ? "" : String(v)];
    }),
  );

/** Arma los datos nuevos sobre los originales (conserva claves que el formulario no edita, como readAt). */
function fromForm(base: Record<string, unknown>, defs: FieldDef[], form: Record<string, string>) {
  let out: Record<string, unknown> = { ...base };
  for (const d of defs) {
    const raw = (form[d.key] ?? "").trim();
    if (d.type === "bool") out = setPath(out, d.key, raw === "1");
    else if (raw === "") out = setPath(out, d.key, undefined);
    else out = setPath(out, d.key, d.type === "number" ? Number(raw) : raw);
  }
  return out;
}

async function push(m: Mutation) {
  const res = await post<PushResponse>("/sync/push", { deviceId: "web", mutations: [m] });
  const r = res.results[0];
  if (r?.status === "rejected") {
    const key = `rejectReasons.${r.reason}`;
    throw new Error(t("ui.recordRejected", { reason: tk(key, { max: 0 }) }) + (r.detail ? ` (${r.detail})` : ""));
  }
}

export function RecordEditForm({
  record: r,
  onDone,
  onCancel,
}: {
  record: RecordRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const defs = FIELDS[r.kind as RecordKind] ?? [];
  const qc = useQueryClient();
  const [form, setForm] = useState(() => toForm(r.data, defs));
  const [invalid, setInvalid] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const parsed = parseRecordData(r.kind as RecordKind, fromForm(r.data, defs, form));
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? t("rejectReasons.invalid"));
      await push({
        mutationId: newId(),
        kind: "records.upsert",
        row: {
          id: r.id,
          farmId: r.farmId,
          plotId: r.plotId,
          poiId: r.poiId,
          kind: r.kind as RecordKind,
          data: parsed.data,
          schemaVersion: RECORD_SCHEMA_VERSION,
          lon: r.lon,
          lat: r.lat,
          gpsAccuracyM: r.gpsAccuracyM ?? null,
          capturedAt: r.capturedAt,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] });
      toast(t("ui.toastRecordSaved"));
      onDone();
    },
    onError: (e) => setInvalid(e instanceof Error ? e.message : String(e)),
  });
  const set = (k: string) => (e: { target: { value: string } }) => {
    setInvalid(null);
    setForm({ ...form, [k]: e.target.value });
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {defs.map((d) => (
        <Field key={d.key} label={d.label}>
          {d.type === "select" ? (
            <Select
              value={form[d.key]}
              onChange={set(d.key)}
              options={d.optional ? [{ value: "", label: "—" }, ...d.options] : d.options}
            />
          ) : d.type === "bool" ? (
            <Select
              value={form[d.key]}
              onChange={set(d.key)}
              options={[
                { value: "1", label: t("app.yes") },
                { value: "0", label: t("app.no") },
              ]}
            />
          ) : d.type === "textarea" ? (
            <textarea
              value={form[d.key]}
              onChange={set(d.key)}
              rows={3}
              className="rounded-md border border-linea bg-papel px-3 py-2 text-[15px] outline-none focus:border-accion focus:ring-2 focus:ring-accion/20"
            />
          ) : (
            <Input
              type={d.type === "number" ? "number" : "text"}
              step={d.type === "number" ? "any" : undefined}
              min={d.type === "number" ? 0 : undefined}
              value={form[d.key]}
              onChange={set(d.key)}
            />
          )}
        </Field>
      ))}
      <p className="text-xs text-tinta-2">{t("ui.editRecordHint")}</p>
      {invalid ? <ErrorBox error={new Error(invalid)} /> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.save")}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t("ui.cancel")}
        </Button>
      </div>
    </form>
  );
}

export function DeleteRecordConfirm({
  record: r,
  onDone,
  onClose,
}: {
  record: RecordRow;
  onDone: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => push({ mutationId: newId(), kind: "records.delete", row: { id: r.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] });
      toast(t("ui.toastRecordDeleted"));
      onDone();
    },
  });
  return (
    <ConfirmModal
      title={tk(`recordKinds.${r.kind}`)}
      message={t("ui.confirmDeleteRecord", {
        kind: tk(`recordKinds.${r.kind}`).toLowerCase(),
        date: fmtDateTime(r.capturedAt),
      })}
      confirmLabel={t("ui.delete")}
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    />
  );
}
