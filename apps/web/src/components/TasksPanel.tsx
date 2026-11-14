import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { checklistProgress, closeRequirements, isOverdue as taskOverdue, LIMITS, localDate, localTime, parseChecklist, parseTaskComments, RECORD_KINDS, RECURRENCES, TASK_PRIORITIES } from "@yvy/shared";
import { del, patch, post } from "../lib/api";
import { deleteWithUndo } from "../lib/undo";
import { dueLabel } from "../lib/dueLabel";
import { fmtDate, fmtDateTime, fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useMembers, useTasks } from "../lib/queries";
import type { Plot, Task } from "../lib/types";
import { CheckCircle2, ChevronDown, Circle, Flag, MessageSquare, Plus } from "lucide-react";
import { ActionMenu } from "./menus";
import { TableExportMenu } from "./TableExportMenu";
import {
  Button,
  EmptyState,
  ErrorBox,
  Field,
  FormActions,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Tabs,
  toast,
} from "./ui";

/** T-01: selección de lotes en el mapa de la estancia; la maneja la pantalla que tiene el mapa. */
export interface PlotPick {
  ids: string[];
  setIds: (ids: string[]) => void;
  picking: boolean;
  setPicking: (v: boolean) => void;
}

export function TasksPanel({
  farmId,
  plots,
  pick,
  title,
}: {
  farmId?: string;
  plots?: Plot[];
  pick?: PlotPick;
  /** Si se pasa, el panel arma el encabezado de la página (título, Nueva tarea y Exportar). */
  title?: string;
}) {
  const tasks = useTasks({ farmId });
  const members = useMembers();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "overdue">("all");
  const [showDone, setShowDone] = useState(false);
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

  if (tasks.isLoading) return <Spinner rows={5} h={56} />;
  if (tasks.error) return <ErrorBox error={tasks.error} />;
  const nowTime = localTime(Date.now());
  const isOverdue = (x: Task) => taskOverdue(x, today, nowTime);
  const shown = (tasks.data ?? []).filter(
    (x) => x.status !== "cancelled" && (x.status === "open" || x.dueDate >= localDate(Date.now() - 7 * 86_400_000)),
  );
  const nOverdue = shown.filter(isOverdue).length;
  const sorted = (filter === "overdue" ? shown.filter(isOverdue) : shown)
    .slice()
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        (a.dueTime ?? "24:00").localeCompare(b.dueTime ?? "24:00") ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    );
  // Las hechas van aparte, plegadas al final
  const visible = sorted.filter((x) => x.status !== "done");
  const done = sorted.filter((x) => x.status === "done").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const byAssignee = new Map<string, Task[]>();
  for (const x of visible)
    byAssignee.set(x.assigneeName ?? x.assigneeId, [...(byAssignee.get(x.assigneeName ?? x.assigneeId) ?? []), x]);

  const newButton = (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      {t("ui.newTask")}
    </Button>
  );
  const exportMenu = (
    <TableExportMenu
      data={() => ({
        name: t("ui.tasksFile"),
        headers: [
          t("ui.assignee"),
          t("ui.taskTitle"),
          t("ui.plot"),
          t("ui.dueDate"),
          t("ui.dueTime"),
          t("ui.taskPriority"),
          t("ui.recurrence"),
          t("ui.statusCol"),
          t("ui.opensRecord"),
        ],
        rows: sorted.map((x) => [
          x.assigneeName ?? x.assigneeId,
          x.title,
          x.plotName,
          fmtIsoDate(x.dueDate),
          x.dueTime ?? "",
          tk(`ui.taskPriority_${x.priority}`),
          tk(`ui.recurrence_${x.recurrence}`),
          isOverdue(x) ? t("ui.overdue") : tk(`ui.status_${x.status}`),
          x.kind ? tk(`recordKinds.${x.kind}`) : "",
        ]),
      })}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {title ? (
        <PageHeader title={title} primary={newButton} menu={exportMenu} />
      ) : (
        <div className="flex items-center justify-between gap-2">
          {newButton}
          {exportMenu}
        </div>
      )}
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: "all", label: t("ui.filterAll") },
          { id: "overdue", label: t("ui.filterOverdue"), count: nOverdue },
        ]}
      />
      {!sorted.length && <EmptyState title={t("ui.noTasks")} />}
      {[...byAssignee.entries()].map(([name, list]) => (
        <section key={name} aria-label={name}>
          <h3 className="mb-1 flex items-baseline gap-2 text-sm font-semibold">
            {name}
            <span className="num text-xs font-normal text-tinta-2">{list.length}</span>
          </h3>
          <ul className="divide-y divide-linea border-y border-linea">
            {list.map((x) => (
              <TaskRow key={x.id} x={x} today={today} overdue={isOverdue(x)} onDelete={() => removeTask(x)} />
            ))}
          </ul>
        </section>
      ))}
      {done.length > 0 && (
        <section aria-label={t("ui.taskDoneSection")}>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone(!showDone)}
            className="flex h-10 cursor-pointer items-center gap-1.5 text-sm font-semibold text-tinta-2 hover:text-surco"
          >
            <ChevronDown size={16} aria-hidden className={`transition-transform ${showDone ? "" : "-rotate-90"}`} />
            {t("ui.taskDoneSection")}
            <span className="num text-xs font-normal">{done.length}</span>
          </button>
          {showDone && (
            <ul className="divide-y divide-linea border-y border-linea">
              {done.map((x) => (
                <TaskRow key={x.id} x={x} today={today} overdue={false} onDelete={() => removeTask(x)} />
              ))}
            </ul>
          )}
        </section>
      )}
      {creating && (
        <NewTaskModal
          farmId={farmId}
          plots={plots}
          pick={pick}
          members={members.data ?? []}
          onClose={() => {
            pick?.setIds([]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function ChecklistProgress({ task }: { task: Task }) {
  const list = parseChecklist(task.checklist);
  if (!list.length) return null;
  const { done, total } = checklistProgress(list);
  return (
    <span className="mt-1 block" data-testid="task-checklist">
      <span className="flex items-center gap-2 text-xs text-tinta-2">
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t("app.checklistProgress", { done, total })}
          className="block h-1.5 w-24 overflow-hidden rounded-full bg-linea"
        >
          <span className="block h-full bg-soja" style={{ width: `${(done / total) * 100}%` }} />
        </span>
        {t("app.checklistProgress", { done, total })}
      </span>
      <span className="mt-1 block text-xs text-tinta-2">
        {list.map((i) => (
          <span key={i.id} className={`block ${i.done ? "line-through" : ""}`}>
            {i.done ? "✓ " : "· "}
            {i.text}
          </span>
        ))}
      </span>
    </span>
  );
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

function TaskRow({ x, today, overdue, onDelete }: { x: Task; today: string; overdue: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const comments = parseTaskComments(x.comments);
  const isDone = x.status === "done";
  const send = useMutation({
    mutationFn: () => post(`/org/tasks/${x.id}/comments`, { text }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast(t("ui.taskCommentSaved"));
    },
  });
  const when = isDone
    ? t("ui.taskDoneOn", { date: fmtDate(x.completedAt ?? Date.parse(`${x.dueDate}T12:00:00-03:00`)) })
    : [dueLabel(x.dueDate, today, overdue), x.dueTime ? t("ui.dueAtTime", { time: x.dueTime }) : null]
        .filter(Boolean)
        .join(" · ");
  return (
    <li className="flex flex-col py-1.5 text-sm">
      <div className="flex min-h-10 items-start gap-2">
        <span className={`mt-1.5 shrink-0 ${isDone ? "text-soja" : overdue ? "text-peligro" : "text-tinta-2"}`}>
          {isDone ? (
            <CheckCircle2 size={18} aria-label={t("ui.status_done")} />
          ) : (
            <Circle size={18} aria-label={t("ui.status_open")} />
          )}
        </span>
        <div className="min-w-0 flex-1 py-1">
          <p className={`flex items-center gap-1.5 leading-5 ${isDone ? "text-tinta-2" : "text-surco"}`}>
            <span className="min-w-0">{x.title}</span>
            {x.priority === "high" && !isDone && (
              <Flag size={14} className="shrink-0 text-trigo" role="img" aria-label={t("ui.taskPriorityHigh")}>
                <title>{t("ui.taskPriorityHigh")}</title>
              </Flag>
            )}
          </p>
          <p className="text-xs leading-4 text-tinta-2">
            <span className={overdue ? "font-medium text-peligro" : ""}>{when}</span>
            {x.recurrence !== "none" && ` · ${tk(`ui.recurrence_${x.recurrence}`)}`}
            {x.plotName ? ` · ${x.plotName}` : ""}
          </p>
          <ChecklistProgress task={x} />
        </div>
        {comments.length > 0 && (
          <button
            type="button"
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-tinta-2 hover:bg-surco/5 hover:text-surco"
            aria-expanded={open}
            aria-label={t("ui.taskCommentsCount", { n: comments.length })}
            title={t("ui.taskCommentsCount", { n: comments.length })}
            onClick={() => setOpen(!open)}
          >
            <MessageSquare size={14} aria-hidden />
            <span className="num">{comments.length}</span>
          </button>
        )}
        <ActionMenu
          label={t("ui.taskActions")}
          items={[
            { label: t("ui.taskCommentSend"), onSelect: () => setOpen(true) },
            x.status === "open" && { label: t("ui.delete"), onSelect: onDelete, danger: true },
          ]}
        />
      </div>
      {open && (
        <div className="mb-1 ml-7 flex flex-col gap-2 border-l border-linea pl-3">
          {comments.map((c) => (
            <p key={c.id} className="text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 text-xs text-tinta-2">{fmtDateTime(c.at)}</span>
              <span className="block whitespace-pre-wrap">{c.text}</span>
            </p>
          ))}
          <form
            className="flex flex-col items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send.mutate();
            }}
          >
            <textarea
              aria-label={t("ui.taskComments")}
              className="min-h-16 w-full rounded-md border border-linea bg-papel px-3 py-2 text-[15px] outline-none focus:border-accion focus:ring-2 focus:ring-accion/20"
              maxLength={LIMITS.tasks.maxCommentLength}
              placeholder={t("ui.taskCommentPlaceholder")}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {send.error && <ErrorBox error={send.error} />}
            <Button type="submit" disabled={send.isPending || !text.trim()}>
              {t("ui.taskCommentSend")}
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}

function NewTaskModal({
  farmId,
  plots,
  pick,
  members,
  onClose,
}: {
  farmId?: string;
  plots?: Plot[];
  pick?: PlotPick;
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
    dueTime: "",
    priority: "normal",
    recurrence: "none",
    checklist: "",
  });
  const picked = pick?.ids ?? [];
  const create = useMutation({
    mutationFn: () => {
      const { checklist, ...rest } = f;
      const items = checklist
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      return post<{ ids: string[] }>("/org/tasks", {
        ...rest,
        farmId: farmValue,
        plotId: f.plotId || null,
        ...(picked.length ? { plotIds: picked } : {}),
        kind: f.kind || null,
        dueTime: f.dueTime || null,
        ...(items.length ? { checklist: items } : {}),
      });
    },
    onSuccess: ({ ids }) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast(ids.length > 1 ? t("ui.toastTasksSaved", { n: ids.length }) : t("ui.toastTaskSaved"));
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const farmValue = f.farmId || (farms.data?.length === 1 ? farms.data[0]!.id : "");
  // Mientras se eligen lotes en el mapa el diálogo se esconde sin desmontarse: el borrador no se pierde.
  return (
    <div hidden={!!pick?.picking}>
      <Modal title={t("ui.newTask")} onClose={onClose}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label={t("ui.taskTitle")}>
            <Input required value={f.title} onChange={set("title")} maxLength={200} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {!farmId && (
              <Field label={t("ui.farm")}>
                <Select
                  required
                  value={farmValue}
                  onChange={set("farmId")}
                  options={[
                    ...(farms.data?.length === 1 ? [] : [{ value: "", label: "" }]),
                    ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name })),
                  ]}
                />
              </Field>
            )}
            {plots && !picked.length && (
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
          </div>
          {plots && pick && (
            <div className="flex flex-col items-start gap-1.5 text-sm">
              {picked.length > 0 && (
                <p>
                  <span className="font-medium">{t("ui.taskPickedPlots", { n: picked.length })}</span>{" "}
                  {picked
                    .map((id) => plots.find((p) => p.id === id)?.name)
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <Button onClick={() => pick.setPicking(true)}>
                {picked.length ? t("ui.taskPickChange") : t("ui.taskPickOnMap")}
              </Button>
              {picked.length > 1 && <p className="text-xs text-tinta-2">{t("ui.taskPickOneEach")}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("ui.dueDate")}>
              <Input type="date" required value={f.dueDate} onChange={set("dueDate")} />
            </Field>
            <Field label={t("ui.dueTime")} hint={t("ui.dueTimeHint")}>
              <Input type="time" value={f.dueTime} onChange={set("dueTime")} />
            </Field>
          </div>
          <details className="group rounded-md border border-linea">
            <summary className="flex h-10 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              {t("ui.taskMoreOptions")}
              <ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-4 border-t border-linea p-3">
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("ui.taskPriority")}>
                  <Select
                    value={f.priority}
                    onChange={set("priority")}
                    options={TASK_PRIORITIES.map((p) => ({ value: p, label: tk(`ui.taskPriority_${p}`) }))}
                  />
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
              {closeRequirements(f.kind) && (
                <p className="text-xs text-tinta-2">
                  {t(
                    closeRequirements(f.kind)!.photo && closeRequirements(f.kind)!.location
                      ? "ui.closeNeedsPhotoLocation"
                      : closeRequirements(f.kind)!.photo
                        ? "ui.closeNeedsPhoto"
                        : "ui.closeNeedsLocation",
                  )}
                </p>
              )}
              <Field label={t("ui.taskChecklist")}>
                <textarea
                  className="min-h-20 w-full rounded-md border border-linea bg-papel px-3 py-2 text-sm outline-none focus:border-accion focus:ring-2 focus:ring-accion/20"
                  value={f.checklist}
                  onChange={set("checklist")}
                  placeholder={t("ui.taskChecklistHint")}
                />
              </Field>
            </div>
          </details>
          {create.error && <ErrorBox error={create.error} />}
          <FormActions onCancel={onClose} disabled={create.isPending} />
        </form>
      </Modal>
    </div>
  );
}
