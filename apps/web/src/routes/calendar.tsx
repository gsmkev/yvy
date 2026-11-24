import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, localDate, tasksByDay, weekDays, weekStart } from "@yvy/shared";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, EmptyState, ErrorBox, PageHeader, Select, Skeleton, Page } from "../components/ui";
import { fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useTasks } from "../lib/queries";

/** Calendario semanal de labores de una estancia (lunes a domingo). */
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
    <Page width="data" className="gap-4 md:h-full">
      <PageHeader title={t("ui.calendar.title")} />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={ChevronLeft} onClick={() => setMonday(addDays(monday, -7))} aria-label={t("ui.calendar.prev")} />
        <span className="num min-w-44 text-center text-sm font-medium">
          {fmtIsoDate(days[0]!)} – {fmtIsoDate(days[6]!)}
        </span>
        <Button icon={ChevronRight} onClick={() => setMonday(addDays(monday, 7))} aria-label={t("ui.calendar.next")} />
        {!isThisWeek && (
          <Button variant="quiet" onClick={() => setMonday(weekStart(today))}>
            {t("ui.calendar.today")}
          </Button>
        )}
        {(farms.data?.length ?? 0) > 1 && (
          <div className="ml-auto w-56">
            <Select
              aria-label={t("ui.common.farm")}
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
          title={t("ui.calendar.empty")}
          action={
            <Link
              to="/tareas"
              className="inline-flex h-10 items-center rounded-md border border-linea bg-papel px-3.5 text-sm font-medium text-surco hover:border-tinta-2/40 hover:bg-lino"
            >
              {t("ui.nav.tasks")}
            </Link>
          }
        />
      )}
      {(tasks.isLoading || total > 0) && (
        <div className="grid grid-cols-1 gap-y-1 md:min-h-0 md:flex-1 md:grid-cols-7 md:grid-rows-1 md:border-t md:border-linea">
          {days.map((d, i) => {
            const list = grouped.get(d)!;
            const isToday = d === today;
            return (
              <section
                key={d}
                aria-label={fmtIsoDate(d)}
                className={`px-2 py-2 md:min-h-0 md:overflow-y-auto md:border-r md:border-linea md:last:border-r-0 ${isToday ? "md:bg-soja/[0.07]" : ""} ${list.length === 0 && !isToday ? "max-md:hidden" : ""}`}
              >
                <h2 className={`mb-2 flex items-baseline gap-1.5 text-sm ${isToday ? "font-semibold text-surco" : "font-medium text-tinta-2"}`}>
                  {tk(`ui.weekday.${i}`)}{" "}
                  <span className={`num ${isToday ? "rounded-full bg-surco px-1.5 text-lino" : ""}`}>{d.slice(8)}</span>
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {list.map((x) => (
                    <li
                      key={x.id}
                      className={`rounded-sm border border-l-[3px] bg-papel px-2 py-1.5 text-sm leading-5 ${
                        x.status === "done"
                          ? "border-linea text-tinta-2"
                          : x.priority === "high"
                            ? "border-linea border-l-trigo"
                            : "border-linea border-l-soja"
                      }`}
                    >
                      <p className="flex items-start gap-1 font-medium">
                        <span className="min-w-0">
                          {x.dueTime ? <span className="num">{x.dueTime} </span> : null}
                          {x.title}
                        </span>
                        {x.status === "done" && (
                          <Check size={14} className="mt-1 shrink-0 text-soja" role="img" aria-label={t("ui.status.done")} />
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
    </Page>
  );
}
