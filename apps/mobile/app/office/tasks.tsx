/**
 * Tareas del equipo (funciones 98 y 62): todas las tareas de todas las estancias desde la base local, agrupadas por
 * persona. Crear, editar/reasignar y borrar van por REST (POST/PATCH/DELETE /org/tasks) y después se sincroniza.
 */
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { MoreVertical, Plus } from "lucide-react-native";
import { checklistProgress, isOverdue, localDate, localTime, parseChecklist, RECORD_KINDS, RECURRENCES, TASK_PRIORITIES, t, type MessageKey, dueLabel } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { memberNames } from "../../src/lib/members";
import { getSession } from "../../src/lib/session";
import { syncNow } from "../../src/lib/sync";
import { showToast } from "../../src/lib/toast";
import { useLocal } from "../../src/lib/useLocal";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { useOnline } from "../../src/office/useOnline";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { type Member } from "../../src/office/team";
import { DateField, FilterChips, FormSheet, SelectField, TextField } from "../../src/office/ui";
import { Button, EmptyState, Row, SectionHeader, Sheet, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

type Filter = "all" | "overdue" | "today" | "done";
const key = (k: string) => k as MessageKey;
const PRIO_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

interface Draft {
  id: string | null;
  title: string;
  assigneeId: string;
  farmId: string;
  plotId: string;
  dueDate: string;
  dueTime: string;
  priority: string;
  recurrence: string;
  kind: string;
  checklist: string;
}

export default function TeamTasks() {
  const today = localDate(Date.now());
  const nowTime = localTime(Date.now());
  const members = useOnline<Member[]>("/org/members");
  const data = useLocal(() => {
    const db = getDb();
    return {
      tasks: db.allTasks(),
      farms: db.farms(),
      plots: db.plots(),
      names: memberNames(db),
    };
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [menu, setMenu] = useState<(typeof data.tasks)[number] | null>(null);
  const [confirm, setConfirm] = useState<(typeof data.tasks)[number] | null>(null);

  const create = useOnlineMutation<Record<string, unknown>, { ids: string[] }>("POST", "/org/tasks", { invalidate: ["/org/members"] });
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/tasks/${b.id}`);
  const remove = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/tasks/${b.id}`);

  const live = data.tasks.filter((x) => x.status !== "cancelled");
  const od = (x: (typeof live)[number]) => isOverdue(x, today, nowTime);
  const byPerson = person === "all" ? live : live.filter((x) => x.assigneeId === person);
  const counts = {
    all: byPerson.filter((x) => x.status === "open").length,
    overdue: byPerson.filter(od).length,
    today: byPerson.filter((x) => x.status === "open" && x.dueDate === today).length,
    done: byPerson.filter((x) => x.status === "done").length,
  };
  const shown = byPerson
    .filter((x) => (filter === "all" ? x.status === "open" : filter === "overdue" ? od(x) : filter === "today" ? x.status === "open" && x.dueDate === today : x.status === "done"))
    .sort((a, b) => (filter === "done" ? (b.completedAt ?? 0) - (a.completedAt ?? 0) : a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? "24:00").localeCompare(b.dueTime ?? "24:00") || (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1)));
  const groups = new Map<string, typeof shown>();
  for (const x of shown) groups.set(x.assigneeId, [...(groups.get(x.assigneeId) ?? []), x]);
  const nameOf = (id: string) => names.get(id) ?? t("office.tasks.person");

  const people = [...new Set(live.map((x) => x.assigneeId))];
  const personOptions = [{ value: "all", label: t("office.tasks.allPeople") }, ...people.map((id) => ({ value: id, label: nameOf(id) }))];
  const memberOptions = (members.data ?? []).map((m) => ({ value: m.userId, label: m.fullName }));

  const openNew = () => {
    setFormError(null);
    create.reset();
    setDraft({ id: null, title: "", assigneeId: getSession()?.user.id && memberOptions.some((o) => o.value === getSession()?.user.id) ? getSession()!.user.id : (memberOptions[0]?.value ?? ""), farmId: data.farms[0]?.id ?? "", plotId: "", dueDate: today, dueTime: "", priority: "normal", recurrence: "none", kind: "", checklist: "" });
  };
  const openEdit = (x: (typeof live)[number]) => {
    setMenu(null);
    setFormError(null);
    edit.reset();
    setDraft({ id: x.id, title: x.title, assigneeId: x.assigneeId, farmId: x.farmId, plotId: x.plotId ?? "", dueDate: x.dueDate, dueTime: x.dueTime ?? "", priority: x.priority, recurrence: x.recurrence, kind: x.kind ?? "", checklist: "" });
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const submit = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return setFormError(t("office.task.needsTitle"));
    if (!draft.assigneeId) return setFormError(t("office.task.needsAssignee"));
    if (!draft.farmId) return setFormError(t("office.task.needsFarm"));
    if (!draft.dueDate) return setFormError(t("office.task.needsDate"));
    if (draft.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.dueTime)) return setFormError(t("office.task.badTime"));
    setFormError(null);
    const common = { title, assigneeId: draft.assigneeId, plotId: draft.plotId || null, kind: draft.kind || null, dueDate: draft.dueDate, dueTime: draft.dueTime || null, priority: draft.priority, recurrence: draft.recurrence };
    const items = draft.checklist.split("\n").map((l) => l.trim()).filter(Boolean);
    const r = draft.id
      ? await edit.mutate({ id: draft.id, ...common })
      : await create.mutate({ ...common, farmId: draft.farmId, ...(items.length ? { checklist: items } : {}) });
    if (r.ok) {
      setDraft(null);
      showToast(t(draft.id ? "office.task.savedEdit" : "ui.toast.taskSaved"));
      void syncNow();
    }
  };

  const doDelete = async (x: (typeof live)[number]) => {
    const r = x.recurrence === "none" ? await remove.mutate({ id: x.id }) : await edit.mutate({ id: x.id, status: "cancelled" });
    if (r.ok) {
      setConfirm(null);
      showToast(t("ui.toast.taskDeleted"));
      void syncNow();
    }
  };

  const plotOptions = [{ value: "", label: t("ui.common.none") }, ...data.plots.filter((p) => p.farmId === draft?.farmId).map((p) => ({ value: p.id, label: p.name }))];
  const err = formError ?? (draft?.id ? edit.error : create.error);

  return (
    <OfficeScreen title={t("office.tasks.title")} query={members} refreshing={false} onRefresh={async () => { await syncNow(); await members.refresh(); }} action={{ label: t("ui.new.task"), icon: Plus, onPress: openNew }}>
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
      {live.length === 0 ? (
        <EmptyState title={t("office.tasks.empty")} hint={t("office.tasks.emptyHint")} />
      ) : shown.length === 0 ? (
        <EmptyState title={t("office.tasks.noMatch")} />
      ) : (
        [...groups.entries()].map(([id, list], i) => (
          <View key={id}>
            <SectionHeader title={`${nameOf(id)} · ${list.length}`} first={i === 0} />
            {list.map((x) => {
              const over = od(x);
              const cl = checklistProgress(parseChecklist(x.checklist));
              const sub = [farmName.get(x.farmId), x.plotId ? plotName.get(x.plotId) : null, x.priority === "high" ? t("ui.task.priorityHigh") : null].filter(Boolean).join(" · ");
              const when = x.status === "done" ? t("ui.status.done") : [dueLabel(x.dueDate, today, over), x.dueTime ? x.dueTime : null].filter(Boolean).join(" · ");
              return (
                <View key={x.id} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Row
                      title={x.title}
                      subtitle={[when, sub, cl.total ? t("app.common.checklistProgress", cl) : null].filter(Boolean).join(" · ")}
                      tone={over ? "danger" : undefined}
                      chevron={false}
                      onPress={() => router.push({ pathname: "/task/[id]", params: { id: x.id } })}
                    />
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("office.task.more")} onPress={() => setMenu(x)} style={{ width: 48, height: 56, alignItems: "center", justifyContent: "center", marginTop: 8 }}>
                    <MoreVertical size={22} color={C.tinta2} strokeWidth={2} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))
      )}

      <FormSheet visible={!!draft} title={draft?.id ? t("office.task.editTitle") : t("ui.new.task")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={create.pending || edit.pending} error={err}>
        {draft ? (
          <>
            <TextField label={t("ui.task.title")} value={draft.title} onChangeText={(v) => set({ title: v })} maxLength={200} />
            <SelectField label={t("ui.common.assignee")} value={draft.assigneeId} options={memberOptions} onChange={(v) => set({ assigneeId: v })} />
            {!draft.id ? <SelectField label={t("ui.common.farm")} value={draft.farmId} options={data.farms.map((f) => ({ value: f.id, label: f.name }))} onChange={(v) => set({ farmId: v, plotId: "" })} /> : null}
            <SelectField label={t("ui.common.plot")} value={draft.plotId} options={plotOptions} onChange={(v) => set({ plotId: v })} />
            <DateField label={t("ui.due.date")} value={draft.dueDate} onChange={(v) => set({ dueDate: v })} />
            <TextField label={t("ui.due.time")} hint={t("ui.due.timeHint")} value={draft.dueTime} onChangeText={(v) => set({ dueTime: v.replace(/[^\d:]/g, "").slice(0, 5) })} placeholder="08:30" />
            <SelectField label={t("ui.task.priority")} value={draft.priority} options={TASK_PRIORITIES.map((p) => ({ value: p, label: t(key(`ui.task.priority_${p}`)) }))} onChange={(v) => set({ priority: v })} />
            <SelectField label={t("ui.common.recurrence")} value={draft.recurrence} options={RECURRENCES.map((r) => ({ value: r, label: t(key(`ui.recurrence.${r}`)) }))} onChange={(v) => set({ recurrence: v })} />
            <SelectField label={t("ui.common.opensRecord")} value={draft.kind} options={[{ value: "", label: t("ui.common.none") }, ...RECORD_KINDS.map((k) => ({ value: k, label: t(key(`record-kinds.kind.${k}`)) }))]} onChange={(v) => set({ kind: v })} />
            {!draft.id ? <TextField label={t("ui.task.checklist")} kind="multiline" hint={t("office.task.checklistLines")} value={draft.checklist} onChangeText={(v) => set({ checklist: v })} /> : null}
          </>
        ) : null}
      </FormSheet>

      <Sheet visible={!!menu} title={menu?.title ?? ""} onClose={() => setMenu(null)}>
        {menu ? (
          <>
            <Row title={t("ui.common.edit")} onPress={() => openEdit(menu)} />
            {menu.status === "open" ? <Row title={menu.recurrence === "none" ? t("ui.common.delete") : t("office.task.cancelRecurring")} tone="danger" onPress={() => { remove.reset(); edit.reset(); setConfirm(menu); setMenu(null); }} /> : null}
          </>
        ) : null}
      </Sheet>
      <Sheet visible={!!confirm} title={t("office.task.deleteTitle")} onClose={() => setConfirm(null)}>
        {confirm ? (
          <>
            <Text style={T.body}>{t("office.task.deleteBody", { title: confirm.title })}</Text>
            {remove.error || edit.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{remove.error ?? edit.error}</Text> : null}
            <Button kind="danger" title={t("ui.common.delete")} loading={remove.pending || edit.pending} onPress={() => void doDelete(confirm)} style={{ marginTop: 16 }} />
            <Button kind="text" title={t("ui.common.cancel")} onPress={() => setConfirm(null)} style={{ marginTop: 4 }} />
          </>
        ) : null}
      </Sheet>
    </OfficeScreen>
  );
}
