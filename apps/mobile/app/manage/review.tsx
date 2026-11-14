/**
 * Para revisar: registros que las reglas simples del servidor marcaron como raros (lluvia alta, dosis fuera de rango,
 * rinde imposible). "Está bien" lo saca de la lista hasta que se edite el registro. Lee GET /org/review y marca con
 * POST /org/review/:id/ok; las reglas viven en el Worker, acá solo se muestran.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { describeRecord, oddityReason, sortReview, t, type MessageKey, type ReviewItem } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { fmtDate, fmtTime } from "../../src/lib/format";
import { api } from "../../src/lib/session";
import { useOnline, useOnlineMutation } from "../../src/lib/online";
import { showToast } from "../../src/lib/toast";
import { Button, EmptyState, Text } from "../../src/ui/kit";
import { OnlineButton, OnlineScreen } from "../../src/ui/online";
import { C, T } from "../../src/ui/theme";

export default function Review() {
  const q = useOnline<ReviewItem[]>("/org/review", { ttlMs: 2 * 60_000 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const ok = useOnlineMutation((id: string) => api("POST", `/org/review/${id}/ok`), { invalidate: ["/org/review"] });
  const markOk = async (id: string) => {
    setBusyId(id);
    const r = await ok.run(id);
    setBusyId(null);
    if (r.ok) showToast(t("ui.toastReviewed"));
  };
  const open = (id: string) => router.push({ pathname: "/record/[id]", params: { id } });
  return (
    <OnlineScreen q={q} ttlMs={2 * 60_000} title={<Text style={T.display}>{t("ui.reviewTitle")}</Text>}>
      {(items) =>
        items.length === 0 ? (
          <EmptyState title={t("ui.reviewEmptyTitle")} hint={t("ui.reviewEmpty")} />
        ) : (
          <View style={{ marginTop: 8 }}>
            <Stack.Screen options={{ title: "" }} />
            {sortReview(items).map((i) => {
              const local = getDb().recordById(i.recordId);
              return (
                <View key={i.recordId} style={st.item}>
                  {i.oddities.map((o, n) => (
                    <Text key={n} style={T.bodyMedium}>
                      {oddityReason(o)}
                    </Text>
                  ))}
                  <Text style={[T.small, { marginTop: 4 }]} numberOfLines={2}>
                    {describeRecord(i.kind, i.data)}
                  </Text>
                  <Text style={T.small}>
                    {[t(`recordKinds.${i.kind}` as MessageKey), i.farmName, i.plotName, i.authorName, `${fmtDate(i.capturedAt)} ${fmtTime(i.capturedAt)}`].filter(Boolean).join(" · ")}
                  </Text>
                  <View style={st.actions}>
                    <View style={{ flex: 1 }}>
                      <OnlineButton title={t("ui.reviewOk")} kind="secondary" offline={ok.offline} sending={busyId === i.recordId} error={busyId === null || busyId === i.recordId ? ok.error : null} onPress={() => void markOk(i.recordId)} disabled={busyId !== null} />
                    </View>
                    {local && <Button kind="text" title={t("ui.reviewOpen")} onPress={() => open(i.recordId)} />}
                  </View>
                </View>
              );
            })}
          </View>
        )
      }
    </OnlineScreen>
  );
}

const st = StyleSheet.create({
  item: { borderLeftWidth: 3, borderLeftColor: C.trigo, paddingLeft: 12, paddingVertical: 12, marginTop: 8, borderBottomWidth: 1, borderBottomColor: C.linea },
  actions: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12 },
});
