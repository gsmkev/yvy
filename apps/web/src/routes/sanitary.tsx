/** Calendario sanitario (G-10): lista por mes de campañas y tratamientos planificados, con estado hecho o vencido. */
import { useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HEALTH_REASONS, HERD_CATEGORIES, localDate, type HerdCategory, type SanitaryState } from "@yvy/shared";
import { del, get, post } from "../lib/api";
import { fmtDate, fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useMe } from "../lib/queries";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../components/ui";

interface EventRow {
  id: string;
  farmId: string | null;
  reason: (typeof HEALTH_REASONS)[number];
  plannedDate: string;
  categories: HerdCategory[];
  product: string | null;
  note: string | null;
  tasksCreated: number;
  state: SanitaryState;
  doneAt: number | null;
}

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const s = new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function SanitaryPage() {
  const me = useMe();
  const farms = useFarms();
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => localDate(Date.now()).slice(0, 7));
  const [creating, setCreating] = useState(false);
  const canPlan = !!me.data && !isFieldRole(me.data.role);
  const events = useQuery({
    enabled: canPlan,
    queryKey: ["sanitary", month],
    queryFn: () => get<EventRow[]>(`/org/sanitary-events?month=${month}`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/sanitary-events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sanitary"] }),
  });
  const farmName = (id: string | null) =>
    id ? (farms.data?.find((f) => f.id === id)?.name ?? "") : t("ui.sanitaryAllFarms");

  if (me.data && !canPlan) return <div className="mx-auto max-w-3xl p-4 text-sm text-tinta-2">{t("ui.sanitaryNoAccess")}</div>;
  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-xl font-semibold">{t("ui.sanitaryTitle")}</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t("ui.sanitaryNew")}
        </Button>
      </div>
      <p className="mb-4 text-sm text-tinta-2">{t("ui.sanitaryIntro")}</p>
      <div className="mb-3 flex items-center gap-3">
        <Button variant="quiet" onClick={() => setMonth(shiftMonth(month, -1))}>
          {t("ui.sanitaryPrev")}
        </Button>
        <span className="min-w-36 text-center font-medium" aria-live="polite">
          {monthLabel(month)}
        </span>
        <Button variant="quiet" onClick={() => setMonth(shiftMonth(month, 1))}>
          {t("ui.sanitaryNext")}
        </Button>
      </div>
      {events.isLoading && <Spinner />}
      {events.error ? <ErrorBox error={events.error} /> : null}
      {events.data && events.data.length === 0 && <Empty title={t("ui.sanitaryEmpty")}>{t("ui.sanitaryEmptyHint")}</Empty>}
      {events.data && events.data.length > 0 && (
        <ul className="divide-y divide-linea border-y border-linea">
          {events.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  <span className="num mr-2 text-tinta-2">{fmtIsoDate(e.plannedDate)}</span>
                  {tk(`fields.healthReason_${e.reason}`)}
                  {e.product ? `: ${e.product}` : ""}
                </p>
                <p className="mt-0.5 text-sm text-tinta-2">
                  {farmName(e.farmId)} ·{" "}
                  {e.categories.length
                    ? e.categories.map((c) => tk(`fields.herd_${c}`).toLowerCase()).join(", ")
                    : t("ui.sanitaryAllCategories")}
                  {e.tasksCreated > 0 ? ` · ${t("ui.sanitaryTasks", { n: e.tasksCreated })}` : ""}
                </p>
                {e.note && <p className="mt-0.5 text-sm text-tinta-2">{e.note}</p>}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span
                  className={
                    e.state === "overdue" ? "font-medium text-peligro" : e.state === "done" ? "font-medium text-accion" : "text-tinta-2"
                  }
                >
                  {e.state === "done" && e.doneAt
                    ? t("ui.sanitaryDoneOn", { date: fmtDate(e.doneAt) })
                    : tk(`ui.sanitaryState_${e.state}`)}
                </span>
                <Button variant="quiet" onClick={() => remove.mutate(e.id)} disabled={remove.isPending}>
                  {t("ui.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <NewEvent
          farms={farms.data ?? []}
          defaultDate={month === localDate(Date.now()).slice(0, 7) ? localDate(Date.now()) : `${month}-01`}
          onClose={() => setCreating(false)}
          onSaved={(n) => {
            qc.invalidateQueries({ queryKey: ["sanitary"] });
            qc.invalidateQueries({ queryKey: ["tasks"] });
            toast(n > 0 ? t("ui.sanitarySavedTasks", { n }) : t("ui.sanitarySaved"));
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function NewEvent({
  farms,
  defaultDate,
  onClose,
  onSaved,
}: {
  farms: { id: string; name: string }[];
  defaultDate: string;
  onClose: () => void;
  onSaved: (tasks: number) => void;
}) {
  const [f, setF] = useState({
    reason: "aftosa" as string,
    plannedDate: defaultDate,
    farmId: "",
    product: "",
    note: "",
    createTasks: true,
  });
  const [cats, setCats] = useState<HerdCategory[]>([]);
  const create = useMutation({
    mutationFn: () =>
      post<{ tasksCreated: number }>("/org/sanitary-events", {
        reason: f.reason,
        plannedDate: f.plannedDate,
        farmId: f.farmId || null,
        categories: cats,
        product: f.product.trim() || null,
        note: f.note.trim() || null,
        createTasks: f.createTasks,
      }),
    onSuccess: (r) => onSaved(r.tasksCreated),
  });
  const set = (k: "reason" | "plannedDate" | "farmId" | "product" | "note") => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={t("ui.sanitaryNew")} onClose={onClose}>
      <form
        className="flex flex-col gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label={t("fields.healthReason")}>
          <Select
            value={f.reason}
            onChange={set("reason")}
            options={HEALTH_REASONS.map((r) => ({ value: r, label: tk(`fields.healthReason_${r}`) }))}
          />
        </Field>
        <Field label={t("ui.dueDate")}>
          <Input type="date" required value={f.plannedDate} onChange={set("plannedDate")} />
        </Field>
        <Field label={t("ui.farm")}>
          <Select
            value={f.farmId}
            onChange={set("farmId")}
            options={[{ value: "", label: t("ui.sanitaryAllFarms") }, ...farms.map((x) => ({ value: x.id, label: x.name }))]}
          />
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{t("ui.sanitaryCategories")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {HERD_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={cats.includes(c)}
                  onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))}
                />
                {tk(`fields.herd_${c}`)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-tinta-2">{t("ui.sanitaryCategoriesHint")}</p>
        </fieldset>
        <Field label={t("fields.product")}>
          <Input value={f.product} onChange={set("product")} maxLength={120} />
        </Field>
        <Field label={t("app.note")}>
          <Input value={f.note} onChange={set("note")} maxLength={500} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.createTasks} onChange={(e) => setF({ ...f, createTasks: e.target.checked })} />
          {t("ui.sanitaryCreateTasks")}
        </label>
        {create.error && <ErrorBox error={create.error} />}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {t("ui.save")}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
