import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { t } from "../../lib/i18n";
import type { Task } from "../../lib/types";
import { EmptyState, Tabs } from "../ui";
import type { Organized, TaskFilter } from "./organize";
import { TaskRow } from "./TaskRow";

/** Lista de tareas: filtro, pendientes por responsable y la sección plegable de las hechas. */
export function TaskList({
  org,
  filter,
  onFilter,
  onDelete,
}: {
  org: Organized;
  filter: TaskFilter;
  onFilter: (f: TaskFilter) => void;
  onDelete: (x: Task) => void;
}) {
  const { today, isOverdue, nOverdue, sorted, done, byAssignee } = org;
  const [showDone, setShowDone] = useState(false);
  return (
    <>
      <Tabs
        value={filter}
        onChange={onFilter}
        tabs={[
          { id: "all", label: t("ui.filter.all") },
          { id: "overdue", label: t("ui.filter.overdue"), count: nOverdue },
        ]}
      />
      {!sorted.length && <EmptyState title={t("ui.no.tasks")} />}
      {[...byAssignee.entries()].map(([name, list]) => (
        <section key={name} aria-label={name}>
          <h3 className="mb-1 flex items-baseline gap-2 text-sm font-semibold">
            {name}
            <span className="num text-xs font-normal text-tinta-2">{list.length}</span>
          </h3>
          <ul className="divide-y divide-linea border-y border-linea">
            {list.map((x) => (
              <TaskRow key={x.id} x={x} today={today} overdue={isOverdue(x)} onDelete={() => onDelete(x)} />
            ))}
          </ul>
        </section>
      ))}
      {done.length > 0 && (
        <section aria-label={t("ui.task.doneSection")}>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone(!showDone)}
            className="flex h-10 cursor-pointer items-center gap-1.5 text-sm font-semibold text-tinta-2 hover:text-surco"
          >
            <ChevronDown size={16} aria-hidden className={`transition-transform ${showDone ? "" : "-rotate-90"}`} />
            {t("ui.task.doneSection")}
            <span className="num text-xs font-normal">{done.length}</span>
          </button>
          {showDone && (
            <ul className="divide-y divide-linea border-y border-linea">
              {done.map((x) => (
                <TaskRow key={x.id} x={x} today={today} overdue={false} onDelete={() => onDelete(x)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
