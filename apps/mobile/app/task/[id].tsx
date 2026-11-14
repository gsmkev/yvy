/**
 * Tarea con lista de verificación (F-15): cada ítem se tilda con un toque, sin señal. Los tildes quedan en el
 * outbox y viajan solos. Después se termina la tarea (o se anota el registro que pide).
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { checklistProgress, LIMITS, parseChecklist, parseTaskComments, t } from "@yvy/shared";
import { useSession } from "../../src/lib/session";
import { getDb } from "../../src/lib/db";
import { localChanged } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { toastSaved } from "../../src/lib/toast";
import { Button, Row, ScreenBody, SectionHeader, s as k, Text, TextInput } from "../../src/ui/kit";
import { C, RADIUS, T } from "../../src/ui/theme";

export default function TaskChecklist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useLocal(() => getDb().taskById(id), [id]);
  const session = useSession();
  const [draft, setDraft] = useState("");
  if (!task)
    return (
      <View style={[k.screen, k.pad]}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={T.heading}>{t("app.taskGone")}</Text>
      </View>
    );
  const list = parseChecklist(task.checklist);
  const comments = parseTaskComments(task.comments);
  const { done, total } = checklistProgress(list);
  const open = task.status === "open";
  const finish = () => {
    if (task.kind) {
      router.replace({
        pathname: "/annotate",
        params: { kind: task.kind, taskId: task.id, plotId: task.plotId ?? "" },
      });
      return;
    }
    getDb().completeTask(task.id, null);
    localChanged();
    toastSaved();
    router.back();
  };
  return (
    <View style={k.screen}>
      <Stack.Screen options={{ title: "" }} />
      <ScreenBody
        footer={
          open ? (
            <Button
              big
              title={
                task.kind
                  ? t("app.taskAnnotate", { kind: t(`recordKinds.${task.kind}`).toLowerCase() })
                  : t("app.taskFinish")
              }
              onPress={finish}
            />
          ) : null
        }
      >
        <Text style={T.title}>{task.title}</Text>
        {list.length > 0 && (
          <Text style={[T.small, { marginTop: 6 }]}>{t("app.checklistProgress", { done, total })}</Text>
        )}
        {list.length > 0 && (
          <View style={{ marginTop: 12 }}>
            {list.map((i) => (
              <Row
                key={i.id}
                title={i.text}
                choice="checkbox"
                selected={i.done}
                disabled={!open}
                onPress={() => {
                  getDb().setChecklistItem(task.id, i.id, !i.done);
                  localChanged();
                }}
                left={i.done ? <Check size={22} color={C.accion} strokeWidth={3} /> : <View style={st.box} />}
              />
            ))}
          </View>
        )}
        <SectionHeader title={t("ui.taskComments")} />
        {comments.map((c) => (
          <View key={c.id} style={{ marginTop: 8 }}>
            <Text style={T.small}>{c.name}</Text>
            <Text style={T.body}>{c.text}</Text>
          </View>
        ))}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t("ui.taskCommentPlaceholder")}
          accessibilityLabel={t("ui.taskComments")}
          multiline
          maxLength={LIMITS.tasks.maxCommentLength}
          style={st.input}
        />
        <Button
          kind="secondary"
          title={t("ui.taskCommentSend")}
          disabled={!draft.trim() || !session || comments.length >= LIMITS.tasks.maxComments}
          onPress={() => {
            if (!session) return;
            getDb().addTaskComment(task.id, session.user.id, session.user.fullName, draft);
            setDraft("");
            localChanged();
          }}
          style={{ marginTop: 8 }}
        />
      </ScreenBody>
    </View>
  );
}

const st = StyleSheet.create({
  input: {
    ...T.body,
    backgroundColor: C.blanco,
    borderWidth: 1.5,
    borderColor: C.lineaFuerte,
    borderRadius: RADIUS,
    padding: 14,
    marginTop: 12,
    minHeight: 88,
    textAlignVertical: "top",
  },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.lineaFuerte },
});
