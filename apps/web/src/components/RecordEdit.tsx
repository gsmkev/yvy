/**
 * Edición y borrado de un registro desde la web. Escribe por /sync/push (mismo protocolo que la app):
 * mutación idempotente con UUIDv7; el Worker valida permisos, ventana de edición y datos.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HEALTH_REASONS,
  IRRIGATION_METHODS,
  SUPPLEMENT_TYPES,
  REPRO_EVENTS,
  SERVICE_METHODS,
  HERD_CATEGORIES,
  MORTALITY_CAUSES,
  MOVE_REASONS,
  CROPS,
  deltaT,
  sprayWarningTexts,
  DENSITY_UNITS,
  FERT_METHODS,
  HARVEST_DESTINATIONS,
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
import { fmtDateTime, toIso } from "../lib/format";
import { t, tk } from "../lib/i18n";
import type { RecordRow } from "../lib/types";
import { Button, ConfirmModal, ErrorBox, Field, Form, Input, Select, toast } from "./ui";

type Opt = { value: string; label: string };
type FieldDef =
  | { key: string; label: string; type: "select"; options: Opt[]; optional?: boolean }
  /** Fecha: se guarda en epoch ms (mediodía de Paraguay) y se edita como día. */
  | { key: string; label: string; type: "number" | "text" | "textarea" | "bool" | "date"; optional?: boolean };

const f = (k: string) => tk(`fields.${k}`);
const opts = (prefix: string, values: readonly string[]): Opt[] =>
  values.map((v) => ({ value: v, label: f(`${prefix}${v}`) }));
const CONDITION = opts("condition.", ["good", "fair", "bad"]);
const LEVEL = opts("level.", ["low", "medium", "high"]);
const NOTE: FieldDef = { key: "note", label: t("app.common.note"), type: "textarea", optional: true };

/** Cabezas por categoría: una clave con punto por categoría ("counts.vaca"); ver getPath y setPath. */
const HERD_FIELDS = (root: string): FieldDef[] =>
  HERD_CATEGORIES.map((c) => ({ key: `${root}.${c}`, label: f(`herd.${c}`), type: "number", optional: true }));

/** `track` se graba en el celular (F-05) y no se edita a mano. */
const FIELDS: Record<RecordKind, FieldDef[]> = {
  track: [],
  scouting: [{ key: "condition", label: f("common.condition"), type: "select", options: CONDITION }, NOTE],
  pest: [
    { key: "pest", label: f("common.pest"), type: "select", options: opts("pest.", PESTS) },
    { key: "intensity", label: f("common.intensity"), type: "select", options: LEVEL, optional: true },
    { key: "perMeter", label: f("per.meter"), type: "number", optional: true },
    NOTE,
  ],
  crop_status: [
    { key: "stage", label: f("common.stage"), type: "select", options: opts("stage.", PHENO_STAGES) },
    { key: "condition", label: f("common.condition"), type: "select", options: CONDITION },
    NOTE,
  ],
  pasture_status: [
    { key: "heightCm", label: f("height.cm"), type: "number" },
    { key: "cover", label: f("common.cover"), type: "select", options: LEVEL },
    { key: "livestockPresent", label: f("common.livestockPresent"), type: "bool" },
    NOTE,
  ],
  rain: [{ key: "mm", label: f("common.mm"), type: "number" }],
  water: [
    {
      key: "level",
      label: f("common.level"),
      type: "select",
      options: opts("water.", ["full", "half", "low", "dry"]),
    },
    NOTE,
  ],
  note: [{ key: "text", label: f("common.text"), type: "textarea" }],
  // ganaderia
  herd_count: [...HERD_FIELDS("counts"), NOTE],
  herd_move: [
    { key: "reason", label: f("move.reason"), type: "select", options: opts("move.reason_", MOVE_REASONS) },
    ...HERD_FIELDS("counts"),
    NOTE,
  ],
  mortality: [
    { key: "category", label: f("herd.category"), type: "select", options: opts("herd.", HERD_CATEGORIES) },
    { key: "head", label: f("common.head"), type: "number" },
    { key: "cause", label: f("common.cause"), type: "select", options: opts("cause.", MORTALITY_CAUSES) },
    NOTE,
  ],
  reproduction: [
    { key: "event", label: f("repro.event"), type: "select", options: opts("repro.event_", REPRO_EVENTS) },
    { key: "head", label: f("common.head"), type: "number" },
    {
      key: "method",
      label: f("repro.method"),
      type: "select",
      options: opts("repro.method_", SERVICE_METHODS),
      optional: true,
    },
    { key: "pregnant", label: f("repro.pregnant"), type: "number", optional: true },
    { key: "calves", label: f("repro.calves"), type: "number", optional: true },
    { key: "tag", label: f("common.tag"), type: "text", optional: true },
    NOTE,
  ],
  weighing: [
    { key: "kg", label: f("common.kg"), type: "number" },
    { key: "tag", label: f("common.tag"), type: "text", optional: true },
    { key: "group", label: f("common.group"), type: "text", optional: true },
    { key: "head", label: f("common.head"), type: "number", optional: true },
    {
      key: "category",
      label: f("herd.category"),
      type: "select",
      options: opts("herd.", HERD_CATEGORIES),
      optional: true,
    },
    NOTE,
  ],
  supplement: [
    { key: "type", label: f("supplement.type"), type: "select", options: opts("supplement.type_", SUPPLEMENT_TYPES) },
    { key: "kg", label: f("common.kg"), type: "number" },
    { key: "product", label: f("common.product"), type: "text", optional: true },
    NOTE,
  ],
  theft: [
    { key: "category", label: f("herd.category"), type: "select", options: opts("herd.", HERD_CATEGORIES) },
    { key: "head", label: f("common.head"), type: "number" },
    { key: "reportedAt", label: f("common.reportedAt"), type: "date", optional: true },
    { key: "policeReport", label: f("police.report"), type: "text", optional: true },
    NOTE,
  ],
  health: [
    { key: "reason", label: f("health.reason"), type: "select", options: opts("health.reason_", HEALTH_REASONS) },
    { key: "product", label: f("common.product"), type: "text" },
    { key: "dose", label: f("common.dose"), type: "text", optional: true },
    ...HERD_FIELDS("counts"),
    { key: "tag", label: f("common.tag"), type: "text", optional: true },
    NOTE,
  ],
  feed: [],
  irrigation: [
    { key: "mm", label: f("irrigation.mm"), type: "number" },
    {
      key: "method",
      label: f("irrigation.method"),
      type: "select",
      options: opts("irrigation.method_", IRRIGATION_METHODS),
    },
    NOTE,
  ],
  fuel_load: [
    { key: "machine", label: f("common.machine"), type: "text" },
    { key: "liters", label: f("common.liters"), type: "number" },
    { key: "meterValue", label: f("meter.value"), type: "number", optional: true },
    NOTE,
  ],
  stock_count: [],
  harvest: [
    { key: "tons", label: f("common.tons"), type: "number" },
    { key: "moisturePct", label: f("moisture.pct"), type: "number", optional: true },
    { key: "areaHa", label: f("area.done"), type: "number", optional: true },
    {
      key: "destination",
      label: f("common.destination"),
      type: "select",
      options: opts("destination.", HARVEST_DESTINATIONS),
      optional: true,
    },
    NOTE,
  ],
  fertilization: [
    { key: "method", label: f("common.method"), type: "select", options: opts("method.", FERT_METHODS) },
    { key: "areaHa", label: f("area.done"), type: "number", optional: true },
    NOTE,
  ],
  application: [
    { key: "volumeLHa", label: f("common.volumeLHa"), type: "number", optional: true },
    { key: "areaHa", label: f("area.done"), type: "number", optional: true },
    { key: "windKmh", label: f("common.windKmh"), type: "number", optional: true },
    { key: "tempC", label: f("common.tempC"), type: "number", optional: true },
    { key: "humidityPct", label: f("common.humidityPct"), type: "number", optional: true },
    { key: "machine", label: f("common.machine"), type: "text", optional: true },
    NOTE,
  ],
  sowing: [
    { key: "crop", label: f("common.crop"), type: "select", options: opts("crop.", CROPS) },
    { key: "variety", label: f("common.variety"), type: "text", optional: true },
    { key: "density", label: f("common.density"), type: "number", optional: true },
    {
      key: "densityUnit",
      label: f("density.unit"),
      type: "select",
      options: opts("density.unit_", DENSITY_UNITS),
      optional: true,
    },
    { key: "areaHa", label: f("area.done"), type: "number", optional: true },
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
      if (d.type === "date") return [d.key, typeof v === "number" ? toIso(v) : ""];
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
    else if (d.type === "date") out = setPath(out, d.key, Date.parse(`${raw}T12:00:00-03:00`));
    else out = setPath(out, d.key, d.type === "number" ? Number(raw) : raw);
  }
  return out;
}

async function push(m: Mutation) {
  const res = await post<PushResponse>("/sync/push", { deviceId: "web", mutations: [m] });
  const r = res.results[0];
  if (r?.status === "rejected") {
    const key = `reject-reasons.reason.${r.reason}`;
    throw new Error(t("ui.common.recordRejected", { reason: tk(key, { max: 0 }) }) + (r.detail ? ` (${r.detail})` : ""));
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
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? t("reject-reasons.reason.invalid"));
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
      toast(t("ui.toast.recordSaved"));
      onDone();
    },
    onError: (e) => setInvalid(e instanceof Error ? e.message : String(e)),
  });
  // A-12: avisos de viento y Delta T al editar las condiciones de una aplicación
  const num = (k: string) => (form[k] === undefined || form[k] === "" ? null : Number(form[k]));
  const warnings =
    r.kind === "application"
      ? sprayWarningTexts({
          windKmh: num("windKmh"),
          deltaT: num("tempC") !== null && num("humidityPct") !== null ? deltaT(num("tempC")!, num("humidityPct")!) : null,
        })
      : [];
  const set = (k: string) => (e: { target: { value: string } }) => {
    setInvalid(null);
    setForm({ ...form, [k]: e.target.value });
  };
  return (
    <Form className="flex flex-col gap-3" onSubmit={() => save.mutate()}>
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
                { value: "1", label: t("app.common.yes") },
                { value: "0", label: t("app.common.no") },
              ]}
            />
          ) : d.type === "textarea" ? (
            <textarea
              value={form[d.key]}
              onChange={set(d.key)}
              rows={3}
              className="rounded-md border border-linea bg-papel px-3 py-2 text-body outline-none focus:border-accion focus:ring-2 focus:ring-accion/20"
            />
          ) : (
            <Input
              type={d.type === "number" ? "number" : d.type === "date" ? "date" : "text"}
              step={d.type === "number" ? "any" : undefined}
              min={d.type === "number" ? 0 : undefined}
              value={form[d.key]}
              onChange={set(d.key)}
            />
          )}
        </Field>
      ))}
      {warnings.map((w) => (
        <p key={w} role="alert" className="rounded-md bg-trigo/20 px-3 py-2 text-sm text-tinta">
          {w}
        </p>
      ))}
      <p className="text-xs text-tinta-2">{t("ui.common.editRecordHint")}</p>
      {invalid ? <ErrorBox error={new Error(invalid)} /> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.common.save")}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t("ui.common.cancel")}
        </Button>
      </div>
    </Form>
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
      toast(t("ui.toast.recordDeleted"));
      onDone();
    },
  });
  return (
    <ConfirmModal
      title={tk(`record-kinds.kind.${r.kind}`)}
      message={t("ui.confirm.deleteRecord", {
        kind: tk(`record-kinds.kind.${r.kind}`).toLowerCase(),
        date: fmtDateTime(r.capturedAt),
      })}
      confirmLabel={t("ui.common.delete")}
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    />
  );
}
