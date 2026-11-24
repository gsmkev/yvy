import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Check, Navigation, TrendingDown, Users } from "lucide-react-native";
import { checklistProgress, describeRecord, parseChecklist, t } from "@yvy/shared";
import { getDb } from "../lib/db";
import { authorName } from "../lib/ownerSummary";
import { localChanged } from "../lib/sync";
import { isOverdue } from "../lib/teamTasks";
import { toastSaved } from "../lib/toast";
import { RECORD_ICON } from "../ui/icons";
import { Row, SectionHeader, StatTile, s as k, Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { commentsLabel, hhmm } from "./format";
import { st } from "./styles";
import type { useTodayData } from "./useTodayData";

type TaskRow = ReturnType<ReturnType<typeof getDb>["tasksToday"]>[number];
type TeamTask = ReturnType<ReturnType<typeof getDb>["openTasks"]>[number];
type RecordRow = ReturnType<ReturnType<typeof getDb>["records"]>[number];

export function taskSubtitle(task: TaskRow, plotName: (id: string | null) => string): string {
  return [
    task.priority === "high" ? t("app.taskHighPriority") : null,
    task.dueTime ? t("app.taskDueAt", { time: task.dueTime }) : null,
    task.kind ? t(`recordKinds.${task.kind}`) : null,
    task.plotId ? plotName(task.plotId) : null,
    parseChecklist(task.checklist).length ? t("app.checklistProgress", checklistProgress(parseChecklist(task.checklist))) : null,
    commentsLabel(task.comments),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Tareas de hoy sin hacer: tildar, abrir o ir al punto. */
export function OpenTasks({ open, readOnly, plotName }: { open: TaskRow[]; readOnly: boolean; plotName: (id: string | null) => string }) {
  return (
    <>
    <SectionHeader title={t("app.tasksToday")} />
    {open.map((task) => {
      const check = () => {
        if (parseChecklist(task.checklist).length) router.push({ pathname: "/task/[id]", params: { id: task.id } });
        else if (readOnly) return;
        else if (task.kind) router.push({ pathname: "/annotate", params: { kind: task.kind, taskId: task.id, plotId: task.plotId ?? "" } });
        else {
          getDb().completeTask(task.id, null);
          localChanged();
          toastSaved();
        }
      };
      const sub = taskSubtitle(task, plotName);
      return (
        <View key={task.id} style={[k.row, st.task]}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`${t("app.taskMarkDone")}: ${task.title}`} onPress={check} hitSlop={6} style={st.checkHit}>
            <View style={st.circle} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sub ? `${task.title}. ${sub}` : task.title}
            onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
            style={st.taskMain}
          >
            <Text style={T.bodyMedium} numberOfLines={2}>
              {task.title}
            </Text>
            {sub ? (
              <Text style={T.small} numberOfLines={2}>
                {sub}
              </Text>
            ) : null}
          </Pressable>
          {task.lon !== null && task.lat !== null && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("app.gotoButton")}: ${task.title}`}
              onPress={() => router.push({ pathname: "/goto", params: { lon: String(task.lon), lat: String(task.lat), name: task.title } })}
              style={st.checkHit}
            >
              <Navigation size={22} color={C.accionOscuro} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      );
    })}
    </>
  );
}

/** Tareas del equipo que vencen hoy o se pasaron (roles de oficina). */
export function TeamTasks({ team, todayIso, userId, names, plotName }: { team: TeamTask[]; todayIso: string; userId: string; names: Record<string, string>; plotName: (id: string | null) => string }) {
  return (
    <>
    <SectionHeader title={t("office.todayTeamTitle")} />
    {team.map((task) => (
      <Row
        key={task.id}
        icon={Users}
        title={task.title}
        subtitle={[
          isOverdue(task, todayIso) ? t("office.todayTeamOverdue", { date: new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("es-PY", { day: "numeric", month: "short" }) }) : null,
          task.assigneeId ? t("office.todayTeamWho", { name: authorName(task.assigneeId, userId, names) }) : t("office.todayTeamNobody"),
          task.plotId ? plotName(task.plotId) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
      />
    ))}
    </>
  );
}

/** Resumen del campo para dueño, administrador y agrónomo: quién anotó y qué lotes empeoraron. */
export function OwnerSummary({ summary, worse, userId, plotName }: { summary: { byAuthor: { authorId: string; count: number }[]; week: boolean; names: Record<string, string> }; worse: { plotId: string; pct: number; since: number }[]; userId: string; plotName: (id: string | null) => string }) {
  return (
    <>
    {summary.byAuthor.length > 0 && <SectionHeader title={summary.week ? t("office.todayWeekTitle") : t("app.ownerRecordsTitle")} />}
    {summary.byAuthor.length > 0 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.stats} style={{ marginTop: 8, flexGrow: 0 }}>
        {summary.byAuthor.map((a) => (
          <StatTile key={a.authorId} value={a.count} label={authorName(a.authorId, userId, summary.names)} />
        ))}
      </ScrollView>
    )}
    {worse.length > 0 && <SectionHeader title={t("app.ownerWorseTitle")} />}
    {worse.map((w) => (
      <Row
        key={w.plotId}
        icon={TrendingDown}
        title={plotName(w.plotId)}
        subtitle={t("app.ownerWorseLine", { pct: w.pct, date: new Date(w.since).toLocaleDateString("es-PY", { day: "numeric", month: "short" }) })}
        onPress={() => router.push("/(tabs)/map")}
      />
    ))}
    </>
  );
}

/** Lo que ya se hizo hoy: tareas cerradas y anotaciones. */
export function YourDay({ done, todayRecords, plotName }: { done: TaskRow[]; todayRecords: RecordRow[]; plotName: (id: string | null) => string }) {
  return (
    <>
    <SectionHeader title={t("app.yourDay")} />
    {done.map((task) => (
      <Row key={task.id} title={task.title} subtitle={t("ui.status_done")} left={<Check size={20} color={C.accion} strokeWidth={2.5} />} />
    ))}
    {todayRecords.map((r) => (
      <Row
        key={r.id}
        icon={RECORD_ICON[r.kind]}
        status={r.rejected ? "rejected" : r.pending ? "pending" : "synced"}
        title={describeRecord(r.kind, JSON.parse(r.data))}
        subtitle={[t(`recordKinds.${r.kind}`), plotName(r.plotId), hhmm(r.capturedAt)].filter(Boolean).join(" · ")}
        onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
      />
    ))}
    </>
  );
}

/** Tareas, equipo, resumen del dueño y lo hecho hoy; cada una solo si tiene algo para mostrar. */
export function TodaySections({ data }: { data: ReturnType<typeof useTodayData> }) {
  const { userId, todayRecords, plotName, readOnly, summary, worse, todayIso, team, open, done } = data;
  const showOwner = !!summary && (summary.byAuthor.length > 0 || worse.length > 0);
  return (
    <>
      {open.length > 0 && <OpenTasks open={open} readOnly={readOnly} plotName={plotName} />}

      {team.length > 0 && <TeamTasks team={team} todayIso={todayIso} userId={userId} names={summary?.names ?? {}} plotName={plotName} />}

      {showOwner && summary && <OwnerSummary summary={summary} worse={worse} userId={userId} plotName={plotName} />}

      {(todayRecords.length > 0 || done.length > 0) && <YourDay done={done} todayRecords={todayRecords} plotName={plotName} />}
    </>
  );
}
