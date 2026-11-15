import { TasksPanel } from "../components/TasksPanel";
import { Page } from "../components/ui";
import { t } from "../lib/i18n";

export function TasksPage() {
  return (
    <Page width="data" className="">
      <TasksPanel title={t("ui.navTasks")} />
    </Page>
  );
}
