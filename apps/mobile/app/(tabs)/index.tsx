import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { useSession } from "../../src/lib/session";
import { localChanged } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { KIND_ICON } from "../../src/lib/forms";
import { Button, H1, Muted, styles as k } from "../../src/ui/kit";
import { C } from "../../src/ui/theme";

/** "Hoy" del empleado (RF-21): sus tareas, que se completan offline; si abren un registro, lo abre. */
export default function Today() {
  const session = useSession();
  const userId = session?.user.id ?? "";
  const tasks = useLocal(() => getDb().tasksToday(userId), [userId]);
  const alerts = useLocal(() => getDb().activeAlerts());
  const plots = useLocal(() => getDb().plots());
  const plotName = (id: string | null) => plots.find((p) => p.id === id)?.name;

  return (
    <ScrollView style={k.screen} contentContainerStyle={k.pad}>
      <H1>{t("app.today")}</H1>
      {alerts.map((a) => (
        <View key={a.id} style={[s.alert, { backgroundColor: a.severity === "warning" ? C.alerta : C.trigo }]}>
          <Text style={s.alertTitle}>
            ▲ {t(`ui.alertKind_${a.kind}` as never)} · {t(`ui.severity_${a.severity}` as never)}
          </Text>
          <Text style={s.alertText}>{a.summary}</Text>
          <Text style={s.alertSmall}>{t("ui.orientative", { source: a.source })}</Text>
        </View>
      ))}
      {tasks.length === 0 && <Muted>{t("app.noTasks")}</Muted>}
      {tasks.map((task) => (
        <View key={task.id} style={[s.task, task.status === "done" && s.done]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.taskTitle, task.status === "done" && s.strike]}>
              {task.kind ? `${KIND_ICON[task.kind]} ` : ""}
              {task.title}
            </Text>
            {task.plotId && <Muted>{plotName(task.plotId)}</Muted>}
          </View>
          {task.status === "open" ? (
            <Button
              title={t("app.taskDone")}
              onPress={() => {
                if (task.kind)
                  router.push({
                    pathname: "/record/[kind]",
                    params: { kind: task.kind, taskId: task.id, plotId: task.plotId ?? "" },
                  });
                else {
                  getDb().completeTask(task.id, null);
                  localChanged();
                }
              }}
            />
          ) : (
            <Text style={s.check}>✔</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  task: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  done: { opacity: 0.6 },
  taskTitle: { fontSize: 18, fontWeight: "600", color: C.surco },
  strike: { textDecorationLine: "line-through" },
  check: { fontSize: 26, color: C.soja, paddingHorizontal: 12 },
  alert: { borderRadius: 12, padding: 14, marginBottom: 12 },
  alertTitle: { color: C.white, fontWeight: "800", fontSize: 16 },
  alertText: { color: C.white, fontSize: 16, marginTop: 4 },
  alertSmall: { color: C.white, opacity: 0.85, fontSize: 12, marginTop: 4 },
});
