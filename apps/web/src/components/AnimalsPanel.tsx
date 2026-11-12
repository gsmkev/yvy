/** Animales con caravana (G-21): búsqueda por caravana, alta, edición, baja e historial con ganancia de peso. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ANIMAL_SEXES,
  describeRecord,
  HERD_CATEGORIES,
  normalizeTag,
  type AnimalHistoryResponse,
  type AnimalRow,
} from "@yvy/shared";
import { del, get, patch, post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Select, Spinner, toast } from "./ui";
import { adgText } from "./WeighingsPanel";

const empty = { tag: "", category: "vaca", sex: "hembra", birthDate: "", note: "" };
type Form = typeof empty;

const toBody = (f: Form) => ({
  tag: f.tag.trim(),
  category: f.category,
  sex: f.sex,
  birthDate: f.birthDate || null,
  note: f.note.trim() || null,
});

function AnimalForm({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: Form;
  pending: boolean;
  error: unknown;
  onSubmit: (f: Form) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="flex max-w-xl flex-col gap-3 border-y border-linea py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(f);
      }}
    >
      <Field label={t("fields.tag")} hint={t("ui.animalTagHint")}>
        <Input value={f.tag} onChange={set("tag")} maxLength={20} autoCapitalize="characters" className="w-48" required />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("fields.herdCategory")}>
          <Select
            value={f.category}
            onChange={set("category")}
            options={HERD_CATEGORIES.map((c) => ({ value: c, label: tk(`fields.herd_${c}`) }))}
          />
        </Field>
        <Field label={t("fields.sex")}>
          <Select value={f.sex} onChange={set("sex")} options={ANIMAL_SEXES.map((c) => ({ value: c, label: tk(`fields.sex_${c}`) }))} />
        </Field>
      </div>
      <Field label={t("ui.animalBirth")}>
        <Input type="date" value={f.birthDate} onChange={set("birthDate")} className="w-48" />
      </Field>
      <Field label={t("app.note")}>
        <Input value={f.note} onChange={set("note")} maxLength={500} />
      </Field>
      {error ? <ErrorBox error={error} /> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending || !f.tag.trim()}>
          {t("ui.save")}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t("ui.cancel")}
        </Button>
      </div>
    </form>
  );
}

function AnimalDetail({ animal, onClose }: { animal: AnimalRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const history = useQuery({
    queryKey: ["animal-history", animal.id],
    queryFn: () => get<AnimalHistoryResponse>(`/org/animals/${animal.id}/history`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["animals"] });
    qc.invalidateQueries({ queryKey: ["animal-history", animal.id] });
  };
  const save = useMutation({
    mutationFn: (f: Form) => patch(`/org/animals/${animal.id}`, toBody(f)),
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast(t("ui.animalSaved"));
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/org/animals/${animal.id}`),
    onSuccess: () => {
      refresh();
      toast(t("ui.animalDeleted"));
      onClose();
    },
  });
  const h = history.data;
  return (
    <section className="flex flex-col gap-3" aria-label={animal.tag}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="num text-lg font-semibold">{animal.tag}</h3>
        <div className="flex gap-2">
          <Button variant="quiet" onClick={() => setEditing(!editing)}>
            {t("ui.edit")}
          </Button>
          <Button variant="quiet" onClick={() => setConfirm(true)}>
            {t("ui.delete")}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {t("ui.close")}
          </Button>
        </div>
      </div>
      <p className="text-sm text-tinta-2">
        {[tk(`fields.herd_${animal.category}`), tk(`fields.sex_${animal.sex}`), animal.birthDate ? t("ui.animalBorn", { date: animal.birthDate.split("-").reverse().join("/") }) : null]
          .filter(Boolean)
          .join(" · ")}
        {animal.note ? ` · ${animal.note}` : ""}
      </p>
      {editing && (
        <AnimalForm
          initial={{ tag: animal.tag, category: animal.category, sex: animal.sex, birthDate: animal.birthDate ?? "", note: animal.note ?? "" }}
          pending={save.isPending}
          error={save.error}
          onSubmit={(f) => save.mutate(f)}
          onCancel={() => setEditing(false)}
        />
      )}
      {history.isLoading ? (
        <Spinner rows={2} h={40} />
      ) : history.error ? (
        <ErrorBox error={history.error} />
      ) : h ? (
        <>
          {h.weight && h.weight.points.length > 0 && (
            <p className="num text-sm">
              {t("ui.animalWeight", { kg: h.weight.lastKg ?? 0, n: h.weight.points.length })}
              {h.weight.adgKg !== null && ` · ${t("ui.animalAdg", { v: adgText(h.weight.adgKg) })}`}
            </p>
          )}
          {h.records.length === 0 ? (
            <p className="text-sm text-tinta-2">{t("ui.animalNoHistory")}</p>
          ) : (
            <ul className="divide-y divide-linea border-y border-linea text-sm">
              {h.records.map((r) => (
                <li key={r.id} className="flex flex-wrap gap-x-3 py-2">
                  <span className="num w-36 text-tinta-2">{fmtDateTime(r.capturedAt)}</span>
                  <span className="font-medium">{tk(`recordKinds.${r.kind}`)}</span>
                  <span className="text-tinta-2">{describeRecord(r.kind, r.data)}</span>
                </li>
              ))}
            </ul>
          )}
          {h.truncated && <p className="text-sm text-tinta-2">{t("ui.herdTruncated")}</p>}
        </>
      ) : null}
      {confirm && (
        <ConfirmModal
          title={animal.tag}
          message={t("ui.animalConfirmDelete", { tag: animal.tag })}
          confirmLabel={t("ui.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  );
}

export function AnimalsPanel({ farmId }: { farmId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AnimalRow | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ["animals", farmId, q],
    queryFn: () => get<AnimalRow[]>(`/org/farms/${farmId}/animals?q=${encodeURIComponent(q)}`),
  });
  const create = useMutation({
    mutationFn: (f: Form) => post<{ id: string }>(`/org/farms/${farmId}/animals`, toBody(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["animals"] });
      setCreating(false);
      toast(t("ui.animalSaved"));
    },
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("ui.animalSearch")}>
          <Input
            value={q}
            onChange={(e) => setQ(normalizeTag(e.target.value).slice(0, 20))}
            placeholder={t("fields.tag")}
            className="w-48"
            autoCapitalize="characters"
          />
        </Field>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t("ui.animalAdd")}
        </Button>
      </div>
      {creating && (
        <AnimalForm initial={empty} pending={create.isPending} error={create.error} onSubmit={(f) => create.mutate(f)} onCancel={() => setCreating(false)} />
      )}
      {list.isLoading ? (
        <Spinner rows={3} h={40} />
      ) : list.error ? (
        <ErrorBox error={list.error} />
      ) : !list.data?.length ? (
        <Empty title={q ? t("ui.animalNoMatch") : t("ui.animalNone")}>{q ? null : t("ui.animalNoneHint")}</Empty>
      ) : (
        <ul className="divide-y divide-linea border-y border-linea text-sm">
          {list.data.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelected(a)}
                aria-current={selected?.id === a.id}
                className={`flex w-full cursor-pointer items-baseline gap-3 py-2.5 text-left hover:bg-linea/40 ${selected?.id === a.id ? "font-medium" : ""}`}
              >
                <span className="num w-32 font-semibold">{a.tag}</span>
                <span className="text-tinta-2">{tk(`fields.herd_${a.category}`)} · {tk(`fields.sex_${a.sex}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <AnimalDetail key={selected.id} animal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
