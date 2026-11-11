import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { localDate, RECORD_KINDS, RECURRENCES } from "@yvy/shared";
import { del, patch, post } from "../lib/api";
import { deleteWithUndo } from "../lib/undo";
import { fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useMembers, useTasks } from "../lib/queries";
import type { Plot, Task } from "../lib/types";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import { ExportButtons } from "./ExportButtons";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Tabs, toast } from "./ui";

export function TasksPanel({ farmId, plots }: { farmId?: string; plots?: Plot[] }) {
  const tasks = useTasks({ farmId });
  const members = useMembers();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "overdue">("all");
  const qc = useQueryClient();
  const today = localDate(Date.now());
  // Las repetitivas se cancelan (PATCH) y las únicas se borran (DELETE); ambas se pueden deshacer
  const removeTask = (x: Task) =>
    deleteWithUndo({
      qc,
      id: x.id,
      message: t("ui.toastTaskDeleted"),
      hide: () => qc.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (l) => l?.filter((y) => y.id !== x.id)),
      request: () =>
        x.recurrence === "none" ? del(`/org/tasks/${x.id}`) : patch(`/org/tasks/${x.id}`, { status: "cancelled" }),
      invalidate: [["tasks"]],
    });

  if (tasks.isLoading) return <Spinner />;
  if (tasks.error) return <ErrorBox error={tasks.error} />;
  const isOverdue = (x: Task) => x.status === "open" && x.dueDate < today;
  const shown = (tasks.data ?? []).filter(
    (x) => x.status !== "cancelled" && (x.status === "open" || x.dueDate >= localDate(Date.now() - 7 * 86_400_000)),
  );
  const nOverdue = shown.filter(isOverdue).length;
  const visible = filter === "overdue" ? shown.filter(isOverdue) : shown;
  const byAssignee = new Map<string, Task[]>();
  for (const x of visible)
    byAssignee.set(x.assigneeName ?? x.assigneeId, [...(byAssignee.get(x.assigneeName ?? x.assigneeId) ?? []), x]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          {t("ui.newTask")}
        </Button>
        <ExportButtons
          data={() => ({
            name: t("ui.tasksFile"),
            headers: [
              t("ui.assignee"),
              t("ui.taskTitle"),
              t("ui.plot"),
              t("ui.dueDate"),
              t("ui.recurrence"),
              t("ui.statusCol"),
              t("ui.opensRecord"),
            ],
            rows: visible.map((x) => [
              x.assigneeName ?? x.assigneeId,
              x.title,
              x.plotName,
              fmtIsoDate(x.dueDate),
              tk(`ui.recurrence_${x.recurrence}`),
              x.status === "open" && x.dueDate < today ? t("ui.overdue") : tk(`ui.status_${x.status}`),
              x.kind ? tk(`recordKinds.${x.kind}`) : "",
            ]),
          })}
        />
      </div>
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: "all", label: t("ui.filterAll") },
          { id: "overdue", label: t("ui.filterOverdue"), count: nOverdue },
        ]}
      />
      {!visible.length && <Empty title={t("ui.noTasks")} />}
      {[...byAssignee.entries()].map(([name, list]) => {
        const overdue = list.filter((x) => x.status === "open" && x.dueDate < today).length;
        return (
          <section key={name} className="border-t border-linea pt-3">
            <h3 className="mb-2 flex items-baseline justify-between gap-2 font-semibold">
              {name}
              {overdue > 0 && (
                <span className="text-sm font-medium text-peligro">
                  {overdue} {t("ui.overdue").toLowerCase()}
                </span>
              )}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {list.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={x.status === "done" ? "text-soja" : x.dueDate < today ? "text-peligro" : "text-tinta-2"}
                  >
                    {x.status === "done" ? (
                      <CheckCircle2 size={18} aria-label={t("ui.status_done")} />
                    ) : (
                      <Circle size={18} aria-label={t("ui.status_open")} />
                    )}
                  </span>
                  <span className={`flex-1 ${x.status === "done" ? "text-tinta-2 line-through" : ""}`}>
                    {x.title}
                    <span className="block text-xs text-tinta-2">
                      {fmtIsoDate(x.dueDate)} · {tk(`ui.recurrence_${x.recurrence}`)}
                      {x.plotName ? ` · ${x.plotName}` : ""}
                      {x.kind ? ` · ${t("ui.opensRecord")}: ${tk(`recordKinds.${x.kind}`)}` : ""}
                    </span>
                  </span>
                  {x.status === "open" && (
                    <button className="text-xs text-tinta-2 hover:text-peligro" onClick={() => removeTask(x)}>
                      {t("ui.delete")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {creating && (
        <NewTaskModal farmId={farmId} plots={plots} members={members.data ?? []} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function NewTaskModal({
  farmId,
  plots,
  members,
  onClose,
}: {
  farmId?: string;
  plots?: Plot[];
  members: { userId: string; fullName: string }[];
  onClose: () => void;
}) {
  const farms = useFarms();
  const qc = useQueryClient();
  const [f, setF] = useState({
    farmId: farmId ?? "",
    plotId: "",
    assigneeId: members[0]?.userId ?? "",
    title: "",
    kind: "",
    dueDate: localDate(Date.now()),
    recurrence: "none",
  });
  const create = useMutation({
    mutationFn: () => post("/org/tasks", { ...f, plotId: f.plotId || null, kind: f.kind || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast(t("ui.toastTaskSaved"));
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={t("ui.newTask")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label={t("ui.taskTitle")}>
          <Input required value={f.title} onChange={set("title")} placeholder="Medir lluvia" />
        </Field>
        {!farmId && (
          <Field label={t("ui.farm")}>
            <Select
              required
              value={f.farmId}
              onChange={set("farmId")}
              options={[{ value: "", label: "—" }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]}
            />
          </Field>
        )}
        {plots && (
          <Field label={t("ui.plot")}>
            <Select
              value={f.plotId}
              onChange={set("plotId")}
              options={[{ value: "", label: t("ui.none") }, ...plots.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </Field>
        )}
        <Field label={t("ui.assignee")}>
          <Select
            required
            value={f.assigneeId}
            onChange={set("assigneeId")}
            options={members.map((m) => ({ value: m.userId, label: m.fullName }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.dueDate")}>
            <Input type="date" required value={f.dueDate} onChange={set("dueDate")} />
          </Field>
          <Field label={t("ui.recurrence")}>
            <Select
              value={f.recurrence}
              onChange={set("recurrence")}
              options={RECURRENCES.map((r) => ({ value: r, label: tk(`ui.recurrence_${r}`) }))}
            />
          </Field>
        </div>
        <Field label={t("ui.opensRecord")}>
          <Select
            value={f.kind}
            onChange={set("kind")}
            options={[
              { value: "", label: t("ui.none") },
              ...RECORD_KINDS.map((k) => ({ value: k, label: tk(`recordKinds.${k}`) })),
            ]}
          />
        </Field>
        {create.error && <ErrorBox error={create.error} />}
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {t("ui.save")}
        </Button>
      </form>
    </Modal>
  );
}
