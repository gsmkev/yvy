/** Exportación de las tareas visibles a Excel y CSV. */
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { TableExportMenu } from "../TableExportMenu";
import type { Organized } from "./organize";

/** Menú de exportación de las tareas ordenadas. */
export function TasksExport({ org }: { org: Organized }) {
  const { sorted, isOverdue } = org;
  return (
    <TableExportMenu
      data={() => ({
        name: t("ui.tasks.file"),
        headers: [
          t("ui.common.assignee"),
          t("ui.task.title"),
          t("ui.common.plot"),
          t("ui.due.date"),
          t("ui.due.time"),
          t("ui.task.priority"),
          t("ui.common.recurrence"),
          t("ui.status.col"),
          t("ui.common.opensRecord"),
        ],
        rows: sorted.map((x) => [
          x.assigneeName ?? x.assigneeId,
          x.title,
          x.plotName,
          fmtIsoDate(x.dueDate),
          x.dueTime ?? "",
          tk(`ui.task.priority_${x.priority}`),
          tk(`ui.recurrence.${x.recurrence}`),
          isOverdue(x) ? t("ui.common.overdue") : tk(`ui.status.${x.status}`),
          x.kind ? tk(`record-kinds.kind.${x.kind}`) : "",
        ]),
      })}
    />
  );
}
