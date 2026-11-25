/** Resumen del día de la página de tareas en escritorio. */
import { t } from "../../lib/i18n";
import { Stat, StatRow } from "../ui";
import type { Organized } from "./organize";

/** Resumen del día para la página de tareas en escritorio: vencidas, de hoy y cantidad por persona. */
export function TasksSummary({ org }: { org: Organized }) {
  const { nOverdue, nToday, byAssignee } = org;
  if (!(nOverdue > 0 || nToday > 0 || byAssignee.size > 0)) return null;
  return (
    <aside aria-label={t("ui.tasks.summary")} className="hidden flex-col gap-5 lg:flex">
      <StatRow>
        {nOverdue > 0 && <Stat label={t("ui.filter.overdue")} value={nOverdue} tone="danger" />}
        {nToday > 0 && <Stat label={t("ui.tasks.forToday")} value={nToday} />}
      </StatRow>
      {byAssignee.size > 0 && (
        <div>
          <h3 className="eyebrow border-b border-linea pb-2">{t("ui.tasks.byPerson")}</h3>
          <ul className="text-sm">
            {[...byAssignee.entries()].map(([name, l]) => (
              <li key={name} className="flex items-baseline justify-between gap-3 border-b border-linea py-2">
                {name}
                <span className="num text-tinta-2">{l.length}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
