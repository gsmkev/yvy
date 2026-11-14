/** Calendario sanitario (G-10): lista por mes de campañas y tratamientos planificados, con estado hecho o vencido. */
import { useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HEALTH_REASONS, HERD_CATEGORIES, localDate, type HerdCategory, type SanitaryState } from "@yvy/shared";
import { del, get, post } from "../lib/api";
import { fmtDate, fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useMe } from "../lib/queries";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RowMenu } from "../components/menus";
import { Button, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, toast } from "../components/ui";

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
  const manyFarms = (farms.data?.length ?? 0) > 1;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title={t("ui.sanitaryTitle")}
        primary={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t("ui.sanitaryNew")}
          </Button>
        }
      />
      <div className="flex items-center gap-1">
        <Button variant="quiet" icon={ChevronLeft} className="w-10 !px-0" aria-label={t("ui.sanitaryPrev")} title={t("ui.sanitaryPrev")} onClick={() => setMonth(shiftMonth(month, -1))} />
        <span className="min-w-40 text-center text-[18px] leading-6 font-semibold" aria-live="polite">
          {monthLabel(month)}
        </span>
        <Button variant="quiet" icon={ChevronRight} className="w-10 !px-0" aria-label={t("ui.sanitaryNext")} title={t("ui.sanitaryNext")} onClick={() => setMonth(shiftMonth(month, 1))} />
      </div>
      {events.isLoading && <Spinner rows={4} h={64} />}
      {events.error ? <ErrorBox error={events.error} /> : null}
      {events.data && events.data.length === 0 && (
        <EmptyState title={t("ui.sanitaryEmpty")}>{t("ui.sanitaryEmptyHint")}</EmptyState>
      )}
      {events.data && events.data.length > 0 && (
        <ul className="divide-y divide-linea border-y border-linea">
          {events.data.map((e) => {
            const meta = [
              manyFarms ? farmName(e.farmId) : "",
              e.categories.map((c) => tk(`fields.herd_${c}`).toLowerCase()).join(", "),
              e.tasksCreated > 0 ? t("ui.sanitaryTasks", { n: e.tasksCreated }) : "",
            ].filter(Boolean);
            return (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span className="num w-24 shrink-0 text-sm text-tinta-2">{fmtIsoDate(e.plannedDate)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {tk(`fields.healthReason_${e.reason}`)}
                    {e.product ? `: ${e.product}` : ""}
                  </p>
                  {meta.length > 0 && <p className="text-sm text-tinta-2">{meta.join(" · ")}</p>}
                  {e.note && <p className="text-sm text-tinta-2">{e.note}</p>}
                </div>
                {e.state === "overdue" && <span className="shrink-0 text-sm font-medium text-peligro">{t("ui.sanitaryState_overdue")}</span>}
                {e.state === "done" && e.doneAt && (
                  <span className="shrink-0 text-sm text-accion">{t("ui.sanitaryDoneOn", { date: fmtDate(e.doneAt) })}</span>
                )}
                <RowMenu name={tk(`fields.healthReason_${e.reason}`)} onDelete={() => remove.mutate(e.id)} />
              </li>
            );
          })}
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
