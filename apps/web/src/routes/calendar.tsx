import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, localDate } from "@yvy/shared";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, EmptyState, ErrorBox, PageHeader, Select, Skeleton } from "../components/ui";
import { tasksByDay, weekDays, weekStart } from "../lib/calendar";
import { fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useTasks } from "../lib/queries";

/** T-04: calendario semanal de labores de una estancia (lunes a domingo). */
export function CalendarPage() {
  const farms = useFarms();
  const [farmId, setFarmId] = useState("");
  const today = localDate(Date.now());
  const [monday, setMonday] = useState(weekStart(today));
  const selected = farmId || farms.data?.[0]?.id || "";
  const tasks = useTasks({ farmId: selected || undefined });
  const days = weekDays(monday);
  const grouped = tasksByDay(tasks.data ?? [], days);
  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);
  const isThisWeek = monday === weekStart(today);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <PageHeader title={t("ui.calendarTitle")} />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={ChevronLeft} onClick={() => setMonday(addDays(monday, -7))} aria-label={t("ui.calendarPrev")} />
        <span className="num min-w-44 text-center text-sm font-medium">
          {fmtIsoDate(days[0]!)} – {fmtIsoDate(days[6]!)}
        </span>
        <Button icon={ChevronRight} onClick={() => setMonday(addDays(monday, 7))} aria-label={t("ui.calendarNext")} />
        {!isThisWeek && (
          <Button variant="quiet" onClick={() => setMonday(weekStart(today))}>
            {t("ui.calendarToday")}
          </Button>
        )}
        {(farms.data?.length ?? 0) > 1 && (
          <div className="ml-auto w-56">
            <Select
              aria-label={t("ui.farm")}
              value={selected}
              onChange={(e) => setFarmId(e.target.value)}
              options={(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
            />
          </div>
        )}
      </div>
      {tasks.isLoading && <Skeleton h={160} />}
      {tasks.error && <ErrorBox error={tasks.error} />}
      {tasks.data && total === 0 && (
        <EmptyState
          title={t("ui.calendarEmpty")}
          action={
            <Link
              to="/tareas"
              className="inline-flex h-10 items-center rounded-md border border-linea bg-papel px-3.5 text-sm font-medium text-surco hover:border-tinta-2/40 hover:bg-lino"
            >
              {t("ui.navTasks")}
            </Link>
          }
        />
      )}
      {(tasks.isLoading || total > 0) && (
        <div className="grid grid-cols-1 gap-x-2 gap-y-1 md:grid-cols-7 md:gap-y-2">
          {days.map((d, i) => {
            const list = grouped.get(d)!;
            return (
              <section
                key={d}
                aria-label={fmtIsoDate(d)}
                className={`rounded-md px-2 py-2 md:min-h-32 md:border md:px-2 ${d === today ? "bg-soja/10 md:border-soja" : "md:border-linea"}`}
              >
                <h2 className={`mb-1 flex items-baseline gap-1.5 text-sm ${d === today ? "font-semibold text-surco" : "font-medium text-tinta-2"}`}>
                  {tk(`ui.weekday_${i}`)} <span className="num">{d.slice(8)}</span>
                </h2>
                <ul className="flex flex-col gap-1">
                  {list.map((x) => (
                    <li
                      key={x.id}
                      className={`rounded-sm border-l-[3px] bg-papel px-2 py-1.5 text-sm leading-5 shadow-[0_0_0_1px_var(--color-linea)] ${
                        x.status === "done" ? "border-linea text-tinta-2" : x.priority === "high" ? "border-trigo" : "border-soja"
                      }`}
                    >
                      <p className="flex items-start gap-1 font-medium">
                        <span className="min-w-0">
                          {x.dueTime ? <span className="num">{x.dueTime} </span> : null}
                          {x.title}
                        </span>
                        {x.status === "done" && (
                          <Check size={14} className="mt-1 shrink-0 text-soja" role="img" aria-label={t("ui.status_done")} />
                        )}
                      </p>
                      <p className="text-xs leading-4 text-tinta-2">
                        {[x.plotName, x.assigneeName].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
