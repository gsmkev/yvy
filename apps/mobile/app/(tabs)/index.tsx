/**
 * Hoy: lo que el recorredor tiene que saber y hacer, en orden. Avisos primero (si hay), después tareas,
 * después lo que ya anotó. Sin secciones vacías: si no hay nada, lo dice una sola vez.
 */
import { useEffect, useRef, type ElementRef } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
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
import { ForecastStrip } from "../../src/ui/ForecastStrip";
import { toastSaved } from "../../src/lib/toast";
import { Button, EmptyState, Row, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { C, RADIUS, T } from "../../src/ui/theme";
import { useReadOnly } from "../../src/lib/readOnly";

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
    return {
      byAuthor: recordsByAuthor(recs, start.getTime()),
      worse: vigorDrops(getDb().lastTwoVigorPasses()),
      names: memberNames(getDb()),
    };
  }, [owner, farmId]);
  const worse = (summary?.worse ?? []).filter((w) => farmPlotIds.has(w.plotId));
  const open = tasks.filter((x) => x.status === "open");
  const done = tasks.filter((x) => x.status === "done");
  const empty = alerts.length === 0 && tasks.length === 0 && todayRecords.length === 0;

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

      {/* Primero lo que pide acción: avisos. */}
      {alerts.map((a) => {
        const strong = a.severity === "warning";
        return (
          <View
            key={a.id}
            onLayout={(e) => {
              alertY.current[a.id] = e.nativeEvent.layout.y;
              if (a.id === alertId) scrollToAlert(a.id);
            }}
            style={[st.alert, strong ? st.alertStrong : st.alertSoft, a.id === alertId && st.alertPicked]}
          >
            <Text style={[T.heading, { color: strong ? C.blanco : C.atencion }]}>
              {t(`ui.alertKind_${a.kind}` as never)}
              {a.probability ? ` · ${t(`ui.probability_${a.probability}` as never).toLowerCase()}` : ""}
            </Text>
            <Text style={[T.body, { color: strong ? C.blanco : C.tinta, marginTop: 4 }]}>{a.summary}</Text>
            <Text style={[T.small, { color: strong ? "rgba(255,255,255,0.8)" : C.tinta2, marginTop: 8 }]}>{t("ui.orientative", { source: a.source })}</Text>
            <View style={st.vote}>
              {votes[a.id] === undefined ? (
                <>
                  <Text style={[T.small, { color: strong ? C.blanco : C.tinta2 }]}>{t("ui.useful")}</Text>
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
                      <Text style={[T.smallMedium, { color: strong ? C.blanco : C.tinta, textDecorationLine: "underline" }]}>{useful ? t("app.yes") : t("app.no")}</Text>
                    </Pressable>
                  ))}
                </>
              ) : (
                <Text style={[T.small, { color: strong ? C.blanco : C.tinta2 }]}>{t("app.thanks")}</Text>
              )}
            </View>
          </View>
        );
      })}

      {/* La lluvia es lo que más se anota: un toque, directo a los milímetros (lluvia de la estancia, sin lote).
          El mismo destino lo abre el atajo de Android (yvy://annotate?kind=rain&farmLevel=1). */}
      {!readOnly && (
        <Button
          kind="secondary"
          title={t("app.quickRain")}
          onPress={() => router.push({ pathname: "/annotate", params: { kind: "rain", farmLevel: "1" } })}
          style={{ marginTop: 16 }}
        />
      )}

      {empty && <EmptyState title={t("app.nothingToday")} hint={t("app.nothingTodayHint")} />}

      {open.length > 0 && (
        <>
          <SectionHeader title={t("app.tasksToday")} />
          {open.map((task) => (
            <View key={task.id}>
              <Row
                title={task.title}
                subtitle={taskSubtitle(task)}
                onPress={() => {
                  if (parseChecklist(task.checklist).length) router.push({ pathname: "/task/[id]", params: { id: task.id } });
                  else if (readOnly) return;
                  else if (task.kind) router.push({ pathname: "/annotate", params: { kind: task.kind, taskId: task.id, plotId: task.plotId ?? "" } });
                  else {
                    getDb().completeTask(task.id, null);
                    localChanged();
                    toastSaved();
                  }
                }}
                right={<View style={st.circle} />}
              />
              <View style={st.taskActions}>
                <Button kind="text" title={commentsLabel(task.comments) ?? t("app.taskCommentsOpen")} onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })} style={st.taskAction} />
                {task.lon !== null && task.lat !== null && (
                  <Button kind="text" title={t("app.gotoButton")} onPress={() => router.push({ pathname: "/goto", params: { lon: String(task.lon), lat: String(task.lat), name: task.title } })} style={st.taskAction} />
                )}
              </View>
            </View>
          ))}
        </>
      )}

      {showOwner && summary && (
        <>
          {summary.byAuthor.length > 0 && <SectionHeader title={t("app.ownerRecordsTitle")} />}
          {summary.byAuthor.map((a) => (
            <Row key={a.authorId} title={authorName(a.authorId, userId, summary.names)} subtitle={t(a.count === 1 ? "app.ownerRecordsOne" : "app.ownerRecordsMany", { n: a.count })} />
          ))}
          {worse.length > 0 && <SectionHeader title={t("app.ownerWorseTitle")} />}
          {worse.map((w) => (
            <Row
              key={w.plotId}
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
              status={r.rejected ? "rejected" : r.pending ? "pending" : "synced"}
              title={describeRecord(r.kind, JSON.parse(r.data))}
              subtitle={[t(`recordKinds.${r.kind}`), plotName(r.plotId), hhmm(r.capturedAt)].filter(Boolean).join(" · ")}
              onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
            />
          ))}
        </>
      )}

      <ForecastStrip farmId={farmId ?? plots[0]?.farmId ?? null} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  alert: { borderRadius: RADIUS, padding: 16, marginTop: 16 },
  alertStrong: { backgroundColor: C.peligro },
  alertSoft: { backgroundColor: C.atencionSuave },
  vote: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 4, minHeight: 44 },
  voteBtn: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  alertPicked: { borderWidth: 3, borderColor: C.tinta },
  taskActions: { flexDirection: "row", gap: 8, marginTop: -4 },
  taskAction: { paddingHorizontal: 0, marginRight: 12 },
  circle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.lineaFuerte },
});
