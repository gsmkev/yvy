import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { checklistProgress, LIMITS, parseChecklist, parseTaskComments, dueLabel } from "@yvy/shared";
import { post } from "../../lib/api";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import type { Task } from "../../lib/types";
import { CheckCircle2, Circle, Flag, MessageSquare } from "lucide-react";
import { ActionMenu } from "../menus";
import { Button, ErrorBox, Form, toast } from "../ui";

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


export function TaskRow({ x, today, overdue, onDelete }: { x: Task; today: string; overdue: boolean; onDelete: () => void }) {
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
          <Form className="flex flex-col items-start gap-2" onSubmit={() => { if (text.trim()) send.mutate(); }}>
            <textarea
              aria-label={t("ui.taskComments")}
              className="min-h-16 w-full rounded-md border border-linea bg-papel px-3 py-2 text-body outline-none focus:border-accion focus:ring-2 focus:ring-accion/20"
              maxLength={LIMITS.tasks.maxCommentLength}
              placeholder={t("ui.taskCommentPlaceholder")}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {send.error && <ErrorBox error={send.error} />}
            <Button type="submit" disabled={send.isPending || !text.trim()}>
              {t("ui.taskCommentSend")}
            </Button>
          </Form>
        </div>
      )}
    </li>
  );
}
