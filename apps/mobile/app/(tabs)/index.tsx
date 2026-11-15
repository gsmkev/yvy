/**
 * Hoy: lo que el recorredor tiene que saber y hacer, en orden. Avisos primero (si hay), después tareas,
 * después lo que ya anotó. Sin secciones vacías: si no hay nada, lo dice una sola vez.
 */
import { useEffect, useRef, useState, type ElementRef } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Check, CloudRain, Users, Navigation, TrendingDown } from "lucide-react-native";
import { checklistProgress, describeRecord, parseChecklist, parseTaskComments, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { byFarm, useFarmChoice } from "../../src/lib/farmFilter";
import { memberNames } from "../../src/lib/members";
import { authorName, isOwnerMode, recordsByAuthor, vigorDrops } from "../../src/lib/ownerSummary";
import { useSession } from "../../src/lib/session";
import { flushAlertVotes, localChanged } from "../../src/lib/sync";
import { readVotes, recordVote } from "../../src/lib/votes";
import { useLocal } from "../../src/lib/useLocal";
import { FarmLine } from "../../src/ui/FarmLine";
import { RECORD_ICON } from "../../src/ui/icons";
import { ForecastStrip } from "../../src/ui/ForecastStrip";
import { toastSaved } from "../../src/lib/toast";
import { Button, EmptyState, Row, SectionHeader, StatTile, s as k, Text } from "../../src/ui/kit";
import { C, RADIUS, T } from "../../src/ui/theme";
import { isOverdue, teamTasksDue } from "../../src/lib/teamTasks";
import { useReadOnly } from "../../src/lib/readOnly";
import { isFieldRoleName } from "../../src/office/team";

const dayLabel = () => {
  const d = new Date();
  const txt = d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};
const commentsLabel = (json: string): string | null => {
  const n = parseTaskComments(json).length;
  return n === 0 ? null : n === 1 ? t("app.taskCommentsOne") : t("app.taskComments", { n });
};
/** Primer nombre sin el tratamiento ("Ing. Ana Villalba" -> "Ana"). */
const firstName = (full: string) => full.replace(/^\s*(ing|dr|dra|lic|sr|sra|don|doña)\.?\s+/i, "").split(" ")[0] ?? "";
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function Today() {
  const session = useSession();
  const { alertId } = useLocalSearchParams<{ alertId?: string }>();
  const scroller = useRef<ElementRef<typeof ScrollView>>(null);
  const alertY = useRef<Record<string, number>>({});
  const userId = session?.user.id ?? "";
  const { farmId } = useFarmChoice();
  const tasks = useLocal(() => byFarm(getDb().tasksToday(userId), farmId), [userId, farmId]);
  const alerts = useLocal(() => byFarm(getDb().activeAlerts(), farmId), [farmId]);
  const plots = useLocal(() => getDb().plots());
  const votes = useLocal(() => readVotes(getDb()));
  const todayRecords = useLocal(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return byFarm(getDb().records(100), farmId).filter((r) => r.capturedAt >= start.getTime());
  }, [farmId]);
  const plotName = (id: string | null) => plots.find((p) => p.id === id)?.name ?? "";
  // F-29: resumen del campo para dueño, administrador y agrónomo.
  const owner = isOwnerMode(session?.organization.role);
  const readOnly = useReadOnly();
  const farmPlotIds = new Set(byFarm(plots, farmId).map((p) => p.id));
  const summary = useLocal(() => {
    if (!owner) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const recs = byFarm(getDb().records(500), farmId);
    const today = recordsByAuthor(recs, start.getTime());
    const weekStart = start.getTime() - 6 * 86_400_000;
    return {
      byAuthor: today.length > 0 ? today : recordsByAuthor(recs, weekStart),
      week: today.length === 0,
      team: byFarm(getDb().openTasks(), farmId),
      worse: vigorDrops(getDb().lastTwoVigorPasses()),
      names: memberNames(getDb()),
    };
  }, [owner, farmId]);
  const worse = (summary?.worse ?? []).filter((w) => farmPlotIds.has(w.plotId));
  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const team = teamTasksDue(summary?.team ?? [], userId, todayIso);
  const open = tasks.filter((x) => x.status === "open");
  const done = tasks.filter((x) => x.status === "done");
  // Roles de oficina: 2 avisos y "Ver los N" (tienen la pantalla de Avisos); roles de campo: todos, compactos.
  const shownAlerts = !isFieldRoleName(session?.organization.role ?? "") && alerts.length > 2 ? [...alerts].sort((x, y) => Number(y.id === alertId) - Number(x.id === alertId) || Number(y.severity === "warning") - Number(x.severity === "warning")).slice(0, 2) : alerts;
  const empty = alerts.length === 0 && tasks.length === 0 && team.length === 0 && todayRecords.length === 0;

  // Primera vez que se entra a otra organización: decir a cuál.
  useEffect(() => {
    const name = getDb().getKv("org_entered_notice");
    if (!name) return;
    getDb().setKv("org_entered_notice", null);
    Alert.alert(t("app.enteredOrg", { name }));
  }, [session?.organization.id]);

  const scrollToAlert = (id: string) => {
    const y = alertY.current[id];
    if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };
  useEffect(() => {
    if (alertId) scrollToAlert(alertId);
  }, [alertId, alerts.length]);

  const taskSubtitle = (task: (typeof open)[number]) =>
    [
      task.priority === "high" ? t("app.taskHighPriority") : null,
      task.dueTime ? t("app.taskDueAt", { time: task.dueTime }) : null,
      task.kind ? t(`recordKinds.${task.kind}`) : null,
      task.plotId ? plotName(task.plotId) : null,
      parseChecklist(task.checklist).length ? t("app.checklistProgress", checklistProgress(parseChecklist(task.checklist))) : null,
      commentsLabel(task.comments),
    ]
      .filter(Boolean)
      .join(" · ");
  const showOwner = !!summary && (summary.byAuthor.length > 0 || worse.length > 0);

  return (
    <ScrollView ref={scroller} style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]}>
      <FarmLine />
      <Text style={T.small}>{dayLabel()}</Text>
      <Text style={[T.display, { marginTop: 2 }]}>{firstName(session?.user.fullName ?? "")}</Text>

      <ForecastStrip farmId={farmId ?? plots[0]?.farmId ?? null} />

      {/* La lluvia es lo que más se anota: un toque, directo a los milímetros (lluvia de la estancia, sin lote).
          El mismo destino lo abre el atajo de Android (yvy://annotate?kind=rain&farmLevel=1). */}
      {!readOnly && (
        <Button
          kind="secondary"
          icon={CloudRain}
          title={t("app.quickRain")}
          onPress={() => router.push({ pathname: "/annotate", params: { kind: "rain", farmLevel: "1" } })}
          style={{ marginTop: 16 }}
        />
      )}

      {/* Primero lo que pide acción: avisos. */}
      {shownAlerts.map((a) => (
        <AlertCard
          key={a.id}
          a={a}
          voted={votes[a.id]}
          picked={a.id === alertId}
          onLayout={(y) => {
            alertY.current[a.id] = y;
            if (a.id === alertId) scrollToAlert(a.id);
          }}
        />
      ))}
      {alerts.length > shownAlerts.length && (
        <Pressable accessibilityRole="button" onPress={() => router.push("/office/alerts" as never)} style={st.seeAll}>
          <Text style={[T.bodyMedium, { color: C.accionOscuro }]}>{t("app.alertsSeeAll", { n: alerts.length })}</Text>
        </Pressable>
      )}

      {empty && <EmptyState title={t("app.nothingToday")} hint={t("app.nothingTodayHint")} />}

      {open.length > 0 && (
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
            const sub = taskSubtitle(task);
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
      )}

      {team.length > 0 && (
        <>
          <SectionHeader title={t("office.todayTeamTitle")} />
          {team.map((task) => (
            <Row
              key={task.id}
              icon={Users}
              title={task.title}
              subtitle={[
                isOverdue(task, todayIso) ? t("office.todayTeamOverdue", { date: new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("es-PY", { day: "numeric", month: "short" }) }) : null,
                task.assigneeId ? t("office.todayTeamWho", { name: authorName(task.assigneeId, userId, summary?.names ?? {}) }) : t("office.todayTeamNobody"),
                task.plotId ? plotName(task.plotId) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
            />
          ))}
        </>
      )}

      {showOwner && summary && (
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
      )}

      {(todayRecords.length > 0 || done.length > 0) && (
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
      )}
    </ScrollView>
  );
}

type AlertRow = ReturnType<ReturnType<typeof getDb>["activeAlerts"]>[number];

/** Aviso compacto: tipo + probabilidad y el resumen en 2 líneas; la fuente y "¿Te sirvió?" aparecen al tocar. */
function AlertCard({ a, voted, picked, onLayout }: { a: AlertRow; voted: boolean | undefined; picked: boolean; onLayout: (y: number) => void }) {
  const [open, setOpen] = useState(picked);
  const strong = a.severity === "warning";
  const fg = strong ? C.blanco : C.tinta;
  const soft = strong ? "rgba(255,255,255,0.85)" : C.tinta2;
  const title = `${t(`ui.alertKind_${a.kind}` as never)}${a.probability ? ` · ${t(`ui.probability_${a.probability}` as never).toLowerCase()}` : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}. ${a.summary}`}
      onPress={() => setOpen((v) => !v)}
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      style={[st.alert, strong ? st.alertStrong : st.alertSoft, picked && st.alertPicked]}
    >
      <Text style={[T.bodyMedium, { color: strong ? C.blanco : C.atencion, fontWeight: "700" }]} numberOfLines={1}>{title}</Text>
      <Text style={[T.small, { color: fg, marginTop: 2 }]} numberOfLines={open ? undefined : 2}>{a.summary}</Text>
      {open && (
        <>
          <Text style={[T.small, { color: soft, marginTop: 6 }]}>{t("ui.orientative", { source: a.source })}</Text>
          <View style={st.vote}>
            {voted === undefined ? (
              <>
                <Text style={[T.small, { color: soft }]}>{t("ui.useful")}</Text>
                {([true, false] as const).map((useful) => (
                  <Pressable
                    key={String(useful)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t("ui.useful")} ${useful ? t("app.yes") : t("app.no")}`}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    onPress={() => {
                      recordVote(getDb(), a.id, useful);
                      localChanged();
                      flushAlertVotes();
                    }}
                    style={st.voteBtn}
                  >
                    <Text style={[T.smallMedium, { color: fg, textDecorationLine: "underline" }]}>{useful ? t("app.yes") : t("app.no")}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={[T.small, { color: soft }]}>{t("app.thanks")}</Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  alert: { borderRadius: RADIUS, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  seeAll: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  alertStrong: { backgroundColor: C.peligro },
  alertSoft: { backgroundColor: C.atencionSuave },
  vote: { flexDirection: "row", alignItems: "center", gap: 20, minHeight: 44 },
  voteBtn: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  alertPicked: { borderWidth: 3, borderColor: C.tinta },
  task: { gap: 4, paddingVertical: 4 },
  taskMain: { flex: 1, minWidth: 0, minHeight: 56, justifyContent: "center", paddingVertical: 4 },
  checkHit: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  stats: { gap: 8, paddingRight: 8 },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.lineaFuerte },
});
