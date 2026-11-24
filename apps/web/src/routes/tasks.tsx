/** Pantalla de tareas de toda la organización. */
import { TasksPanel } from "../components/TasksPanel";
import { Page } from "../components/ui";
import { t } from "../lib/i18n";

/** Lista de tareas de todas las estancias. */
export function TasksPage() {
  return (
    <Page width="data" className="">
      <TasksPanel title={t("ui.nav.tasks")} />
    </Page>
  );
}
