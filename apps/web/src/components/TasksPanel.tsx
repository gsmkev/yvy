import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { del, patch } from "../lib/api";
import { t } from "../lib/i18n";
import { useMembers, useTasks } from "../lib/queries";
import type { Plot, Task } from "../lib/types";
import { deleteWithUndo } from "../lib/undo";
import { NewTaskModal, type PlotPick } from "./tasks/NewTaskModal";
import { organizeTasks, type TaskFilter } from "./tasks/organize";
import { TaskList } from "./tasks/TaskList";
import { TasksExport } from "./tasks/TasksExport";
import { TasksSummary } from "./tasks/TasksSummary";
import { Button, ErrorBox, PageHeader, Spinner } from "./ui";

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
  const [filter, setFilter] = useState<TaskFilter>("all");
  const qc = useQueryClient();
  // Las repetitivas se cancelan (PATCH) y las únicas se borran (DELETE); ambas se pueden deshacer
  const removeTask = (x: Task) =>
    deleteWithUndo({
      qc,
      id: x.id,
      message: t("ui.toast.taskDeleted"),
      hide: () => qc.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (l) => l?.filter((y) => y.id !== x.id)),
      request: () =>
        x.recurrence === "none" ? del(`/org/tasks/${x.id}`) : patch(`/org/tasks/${x.id}`, { status: "cancelled" }),
      invalidate: [["tasks"]],
    });

  if (tasks.isLoading) return <Spinner rows={5} h={56} />;
  if (tasks.error) return <ErrorBox error={tasks.error} />;
  const org = organizeTasks(tasks.data ?? [], filter);

  const newButton = (
    <Button variant={title ? "primary" : "secondary"} icon={Plus} onClick={() => setCreating(true)}>
      {t("ui.new.task")}
    </Button>
  );
  const exportMenu = <TasksExport org={org} />;
  const list = <TaskList org={org} filter={filter} onFilter={setFilter} onDelete={removeTask} />;

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
      {title ? (
        // Como página: la lista a la izquierda y, en escritorio, el resumen del día a un costado
        <div className="grid items-start gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,720px)_300px]">
          <div className="flex flex-col gap-4">{list}</div>
          <TasksSummary org={org} />
        </div>
      ) : (
        list
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
