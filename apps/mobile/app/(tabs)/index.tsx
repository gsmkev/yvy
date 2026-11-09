import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, ListChecks } from "lucide-react-native";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { useSession } from "../../src/lib/session";
import { localChanged } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { ALERT_ICON, RECORD_ICON } from "../../src/ui/icons";
import { EmptyState, Eyebrow, Header, Muted, styles as k } from "../../src/ui/kit";
import { C, MONO, TOUCH } from "../../src/ui/theme";

const today = () => new Date().toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });

/** "Hoy" del empleado (RF-21): avisos de sus lotes y tareas, que se completan sin señal. */
export default function Today() {
  const session = useSession();
  const userId = session?.user.id ?? "";
  const tasks = useLocal(() => getDb().tasksToday(userId), [userId]);
  const alerts = useLocal(() => getDb().activeAlerts());
  const plots = useLocal(() => getDb().plots());
  const plotName = (id: string | null) => plots.find((p) => p.id === id)?.name;
  const open = tasks.filter((x) => x.status === "open").length;

  const complete = (task: (typeof tasks)[number]) => {
    if (task.kind)
      router.push({
        pathname: "/record/[kind]",
        params: { kind: task.kind, taskId: task.id, plotId: task.plotId ?? "" },
      });
    else {
      getDb().completeTask(task.id, null);
      localChanged();
    }
  };

  return (
    <ScrollView style={k.screen} contentContainerStyle={k.pad}>
      <Header eyebrow={today()} title={`${t("app.today")}, ${session?.user.fullName.split(" ")[0] ?? ""}`} />

      {alerts.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Eyebrow>{t("app.alertsActive")}</Eyebrow>
          {alerts.map((a) => {
            const Icon = ALERT_ICON[a.kind] ?? AlertTriangle;
            const strong = a.severity === "warning";
            return (
              <View key={a.id} style={[s.alert, strong ? s.alertStrong : s.alertSoft]}>
                <Icon size={22} color={strong ? C.white : C.trigoTexto} strokeWidth={2.2} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.alertTitle, { color: strong ? C.white : C.surco }]}>
                    {t(`ui.alertKind_${a.kind}` as never)} · {t(`ui.severity_${a.severity}` as never)}
                  </Text>
                  <Text style={[s.alertText, { color: strong ? C.white : C.surco }]}>{a.summary}</Text>
                  <Text style={[s.alertSmall, { color: strong ? C.lino : C.tinta2 }]}>
                    {t("ui.orientative", { source: a.source })}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Eyebrow>
        {t("app.tasksToday")} · {open}
      </Eyebrow>
      {tasks.length === 0 && <EmptyState icon={ListChecks} title={t("app.noTasks")} text={t("app.noTasksHint")} />}
      {tasks.map((task) => {
        const done = task.status === "done";
        const KindIcon = task.kind ? RECORD_ICON[task.kind] : null;
        return (
          <Pressable
            key={task.id}
            disabled={done}
            onPress={() => complete(task)}
            accessibilityRole="button"
            accessibilityLabel={`${task.title}. ${done ? t("ui.status_done") : t("app.taskDone")}`}
            style={({ pressed }) => [s.task, done && s.done, pressed && { opacity: 0.85 }]}
          >
            {done ? (
              <CheckCircle2 size={28} color={C.soja} strokeWidth={2} />
            ) : (
              <Circle size={28} color={C.tinta2} strokeWidth={1.75} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.taskTitle, done && s.strike]}>{task.title}</Text>
              <View style={s.meta}>
                {KindIcon && <KindIcon size={14} color={C.tinta2} />}
                <Muted>
                  {task.kind ? t(`recordKinds.${task.kind}`) : ""}
                  {task.plotId ? ` · ${plotName(task.plotId)}` : ""}
                </Muted>
              </View>
            </View>
            {!done && <ChevronRight size={22} color={C.tinta2} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  task: {
    minHeight: TOUCH + 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.linea,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  done: { backgroundColor: C.papel },
  taskTitle: { fontSize: 18, fontWeight: "600", color: C.surco },
  strike: { textDecorationLine: "line-through", color: C.tinta2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  alert: { flexDirection: "row", gap: 12, borderRadius: 12, padding: 14, marginTop: 10 },
  alertStrong: { backgroundColor: C.peligro },
  alertSoft: { backgroundColor: "#F6EBCB", borderWidth: 1, borderColor: C.trigo },
  alertTitle: { fontWeight: "800", fontSize: 15 },
  alertText: { fontSize: 16, marginTop: 2 },
  alertSmall: { ...MONO, fontSize: 11, marginTop: 6 },
});
