/**
 * Tareas del equipo: todas las tareas de todas las estancias desde la base local, agrupadas por
 * persona. Crear, editar/reasignar y borrar van por REST (POST/PATCH/DELETE /org/tasks) y después se sincroniza.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { localDate, localTime, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { memberNames } from "../../src/lib/members";
import { getSession } from "../../src/lib/session";
import { syncNow } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { groupByAssignee, taskCounts, tasksFor, type Filter } from "../../src/office/tasks/model";
import { TaskGroups } from "../../src/office/tasks/TaskGroups";
import { DeleteTaskSheet, TaskFormSheet, TaskMenuSheet } from "../../src/office/tasks/TaskSheets";
import { useTaskEditor } from "../../src/office/tasks/useTaskEditor";
import { type Member } from "../../src/office/team";
import { FilterChips, SelectField } from "../../src/office/ui";
import { useOnline } from "../../src/office/useOnline";
import { EmptyState } from "../../src/ui/kit";

/** Tareas del equipo: asignación, seguimiento y estado. */
export default function TeamTasks() {
  const clock = { today: localDate(Date.now()), nowTime: localTime(Date.now()) };
  const members = useOnline<Member[]>("/org/members");
  const data = useLocal(() => {
    const db = getDb();
    return { tasks: db.allTasks(), farms: db.farms(), plots: db.plots(), names: memberNames(db) };
  });
  const names = useMemo(() => {
    const m = new Map(Object.entries(data.names));
    for (const x of members.data ?? []) m.set(x.userId, x.fullName);
    return m;
  }, [data.names, members.data]);
  const plotName = useMemo(() => new Map(data.plots.map((p) => [p.id, p.name])), [data.plots]);
  const farmName = useMemo(() => new Map(data.farms.map((f) => [f.id, f.name])), [data.farms]);
  const [filter, setFilter] = useState<Filter>("all");
  const [person, setPerson] = useState("all");
  const editor = useTaskEditor();

  const live = data.tasks.filter((x) => x.status !== "cancelled");
  const byPerson = person === "all" ? live : live.filter((x) => x.assigneeId === person);
  const counts = taskCounts(byPerson, clock);
  const shown = tasksFor(filter, byPerson, clock);
  const nameOf = (id: string) => names.get(id) ?? t("office.tasks.person");
  const people = [...new Set(live.map((x) => x.assigneeId))];
  const personOptions = [{ value: "all", label: t("office.tasks.allPeople") }, ...people.map((id) => ({ value: id, label: nameOf(id) }))];
  const memberOptions = (members.data ?? []).map((m) => ({ value: m.userId, label: m.fullName }));

  const openNew = () => {
    const me = getSession()?.user.id;
    const assignee = me && memberOptions.some((o) => o.value === me) ? me : (memberOptions[0]?.value ?? "");
    editor.openNew(clock.today, assignee, data.farms[0]?.id ?? "");
  };

  return (
    <OfficeScreen
      title={t("office.tasks.title")}
      query={members}
      refreshing={false}
      onRefresh={async () => {
        await syncNow();
        await members.refresh();
      }}
      action={{ label: t("ui.new.task"), icon: Plus, onPress: openNew }}
    >
      <FilterChips<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("ui.filter.all"), count: counts.all },
          { value: "overdue", label: t("ui.filter.overdue"), count: counts.overdue },
          { value: "today", label: t("office.tasks.filterToday"), count: counts.today },
          { value: "done", label: t("office.tasks.filterDone"), count: counts.done },
        ]}
      />
      {people.length > 1 ? (
        <View style={{ marginTop: 12 }}>
          <SelectField label={t("office.tasks.person")} value={person} options={personOptions} onChange={setPerson} />
        </View>
      ) : null}
      {live.length === 0 && <EmptyState title={t("office.tasks.empty")} hint={t("office.tasks.emptyHint")} />}
      {live.length > 0 && shown.length === 0 && <EmptyState title={t("office.tasks.noMatch")} />}
      {shown.length > 0 && <TaskGroups groups={groupByAssignee(shown)} clock={clock} nameOf={nameOf} farmName={farmName} plotName={plotName} onMenu={editor.setMenu} />}
      <TaskFormSheet editor={editor} farms={data.farms} plots={data.plots} memberOptions={memberOptions} />
      <TaskMenuSheet editor={editor} />
      <DeleteTaskSheet editor={editor} />
    </OfficeScreen>
  );
}
