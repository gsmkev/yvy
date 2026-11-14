import { TasksPanel } from "../components/TasksPanel";
import { t } from "../lib/i18n";

export function TasksPage() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <TasksPanel title={t("ui.navTasks")} />
    </div>
  );
}
