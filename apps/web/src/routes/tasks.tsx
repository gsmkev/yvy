import { TasksPanel } from "../components/TasksPanel";
import { t } from "../lib/i18n";

export function TasksPage() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-3 text-xl font-semibold">{t("ui.navTasks")}</h1>
      <TasksPanel />
    </div>
  );
}
