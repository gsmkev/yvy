import { useState } from "react";
import { addDays, localDate } from "@yvy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Empty, ErrorBox, Select, Spinner } from "../components/ui";
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
  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="mb-3 text-xl font-semibold">{t("ui.calendarTitle")}</h1>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(farms.data?.length ?? 0) > 1 && (
          <div className="w-56">
            <Select
              aria-label={t("ui.farm")}
              value={selected}
              onChange={(e) => setFarmId(e.target.value)}
              options={(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
            />
          </div>
        )}
        <Button icon={ChevronLeft} onClick={() => setMonday(addDays(monday, -7))} aria-label={t("ui.calendarPrev")}>
          {""}
        </Button>
        <span className="num text-sm">
          {fmtIsoDate(days[0]!)} – {fmtIsoDate(days[6]!)}
        </span>
        <Button icon={ChevronRight} onClick={() => setMonday(addDays(monday, 7))} aria-label={t("ui.calendarNext")}>
          {""}
        </Button>
        <Button onClick={() => setMonday(weekStart(today))}>{t("ui.calendarToday")}</Button>
      </div>
      {tasks.isLoading && <Spinner rows={4} h={56} />}
      {tasks.error && <ErrorBox error={tasks.error} />}
      {tasks.data && total === 0 && <Empty>{t("ui.calendarEmpty")}</Empty>}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map((d, i) => (
          <section
            key={d}
            aria-label={fmtIsoDate(d)}
            className={`min-h-24 rounded-md border p-2 ${d === today ? "border-soja bg-soja/5" : "border-linea"}`}
          >
            <h2 className="eyebrow mb-1">
              {tk(`ui.weekday_${i}`)} <span className="num">{d.slice(8)}</span>
            </h2>
            <ul className="flex flex-col gap-1">
              {grouped.get(d)!.map((x) => (
                <li
                  key={x.id}
                  className={`rounded border px-2 py-1 text-xs ${
                    x.status === "done" ? "border-linea text-tinta-2 line-through" : x.priority === "high" ? "border-peligro/50" : "border-linea"
                  }`}
                >
                  <div className="font-medium">
                    {x.dueTime ? <span className="num">{x.dueTime} </span> : null}
                    {x.title}
                  </div>
                  <div className="text-tinta-2">
                    {[x.plotName, x.assigneeName].filter(Boolean).join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
