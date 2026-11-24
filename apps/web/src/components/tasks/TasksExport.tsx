import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { TableExportMenu } from "../TableExportMenu";
import type { Organized } from "./organize";

export function TasksExport({ org }: { org: Organized }) {
  const { sorted, isOverdue } = org;
  return (
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
}
