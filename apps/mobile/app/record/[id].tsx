/**
 * Ficha de un registro. Editar y borrar solo para el autor y dentro de las 24 h de capturado (RF-34);
 * pasado ese tiempo el servidor también lo rechaza.
 */
import { Alert, Image, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { describeRecord, LIMITS, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { accuracyLabel } from "../../src/lib/location";
import { useSession } from "../../src/lib/session";
import { localChanged, syncNow } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { Button, s as k, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

export default function RecordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const record = useLocal(() => getDb().recordById(id), [id]);
  const plots = useLocal(() => getDb().plots());
  const photos = useLocal(() => (record ? getDb().photosOfRecord(record.id) : []), [record?.id]);

  if (!record)
    return (
      <View style={[k.screen, k.pad]}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={T.heading}>{t("app.recordGone")}</Text>
      </View>
    );

  const data = JSON.parse(record.data) as Record<string, unknown>;
  const plot = plots.find((p) => p.id === record.plotId);
  const when = new Date(record.capturedAt).toLocaleString("es-PY", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  const mine = !!session && record.authorId === session.user.id;
  const editable = mine && Date.now() - record.capturedAt < LIMITS.sync.workerEditWindowMs;
  const hasPlace = record.lon !== null && record.lat !== null;

  const remove = () =>
    Alert.alert(t("app.recordDeleteTitle"), t("ui.confirmDelete", { name: t(`recordKinds.${record.kind}`).toLowerCase() }), [
      { text: t("ui.cancel"), style: "cancel" },
      {
        text: t("ui.delete"),
        style: "destructive",
        onPress: () => {
          getDb().deleteRecord(record.id);
          localChanged();
          syncNow();
          router.back();
        },
      },
    ]);

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 60 }]}>
      <Text style={T.small}>{[t(`recordKinds.${record.kind}`), plot?.name].filter(Boolean).join(" · ")}</Text>
      <Text style={[T.title, { marginTop: 4 }]}>{describeRecord(record.kind, data)}</Text>
      <Text style={[T.body, { marginTop: 16 }]}>{t("app.recordCapturedAt", { when })}</Text>
      {hasPlace && <Text style={[T.small, { marginTop: 4 }]}>{accuracyLabel(record.gpsAccuracyM)}</Text>}
      {photos.length > 0 && (
        <View style={st.photos}>
          {photos.map((p) => (p.thumbUri ? <Image key={p.id} source={{ uri: p.thumbUri }} style={st.thumb} /> : null))}
        </View>
      )}
      {hasPlace && (
        <Button
          kind="secondary"
          title={t("app.gotoButton")}
          onPress={() => router.push({ pathname: "/goto", params: { lon: String(record.lon), lat: String(record.lat), name: describeRecord(record.kind, data) } })}
          style={{ marginTop: 20 }}
        />
      )}
      <View style={{ height: 32 }} />
      {editable ? (
        <>
          <Button big title={t("app.recordEdit")} onPress={() => router.push({ pathname: "/annotate", params: { recordId: record.id } })} />
          <Button kind="danger" title={t("ui.delete")} onPress={remove} style={{ marginTop: 12 }} />
          <Text style={[T.small, { marginTop: 12 }]}>{t("app.editWindow")}</Text>
        </>
      ) : (
        mine && <Text style={T.small}>{t("app.recordLocked")}</Text>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  thumb: { width: 104, height: 104, borderRadius: 12 },
});
