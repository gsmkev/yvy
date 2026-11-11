/**
 * Tarea con lista de verificación (F-15): cada ítem se tilda con un toque, sin señal. Los tildes quedan en el
 * outbox y viajan solos. Después se termina la tarea (o se anota el registro que pide).
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { checklistProgress, parseChecklist, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { localChanged } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { Button, Row, s as k, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

export default function TaskChecklist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useLocal(() => getDb().taskById(id), [id]);
  if (!task)
    return (
      <View style={[k.screen, k.pad]}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={T.heading}>{t("app.taskGone")}</Text>
      </View>
    );
  const list = parseChecklist(task.checklist);
  const { done, total } = checklistProgress(list);
  const open = task.status === "open";
  const finish = () => {
    if (task.kind) {
      router.replace({ pathname: "/annotate", params: { kind: task.kind, taskId: task.id, plotId: task.plotId ?? "" } });
      return;
    }
    getDb().completeTask(task.id, null);
    localChanged();
    router.back();
  };
  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 60 }]}>
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{task.title}</Text>
      <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{t("app.checklistProgress", { done, total })}</Text>
      {list.map((i) => (
        <Row
          key={i.id}
          title={i.text}
          selected={i.done}
          disabled={!open}
          onPress={() => {
            getDb().setChecklistItem(task.id, i.id, !i.done);
            localChanged();
          }}
          left={i.done ? <Check size={22} color={C.accion} strokeWidth={3} /> : <View style={st.box} />}
        />
      ))}
      {open && (
        <Button
          big
          title={task.kind ? t("app.taskAnnotate", { kind: t(`recordKinds.${task.kind}`).toLowerCase() }) : t("app.taskFinish")}
          onPress={finish}
          style={{ marginTop: 20 }}
        />
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.lineaFuerte },
});
