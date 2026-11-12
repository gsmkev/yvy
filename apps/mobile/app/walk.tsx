/**
 * Grabar recorrida (F-05): empieza y termina la persona. Con la app abierta; sin servicio en segundo plano.
 * Al terminar queda un registro `track` (línea simplificada, distancia y tiempo) en el lote donde empezó.
 */
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { t } from "@yvy/shared";
import { formatDistance } from "../src/lib/bearing";
import { getDb } from "../src/lib/db";
import { useFarmChoice } from "../src/lib/farmFilter";
import { guessPlots } from "../src/lib/location";
import { useSession } from "../src/lib/session";
import { localChanged } from "../src/lib/sync";
import { toastSaved, showToast } from "../src/lib/toast";
import { discardWalk, recoverDraft, startWalk, stopWalk, useWalk } from "../src/lib/walk";
import { buildTrack, durationS, formatDuration, isTooShort, type WalkDraft } from "../src/lib/walkTracker";
import { Button, s as k, Text } from "../src/ui/kit";
import { T } from "../src/ui/theme";

export default function Walk() {
  const session = useSession();
  const { recording, draft } = useWalk();
  const { current } = useFarmChoice();
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<WalkDraft | null>(() => recoverDraft());
  const [, tick] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  if (!session) return null;

  /** Guarda el borrador como registro `track` en el lote del primer punto (o sin lote, en la estancia elegida). */
  const save = (d: WalkDraft) => {
    if (isTooShort(d)) {
      discardWalk();
      setPending(null);
      showToast(t("app.walkTooShort"));
      return router.back();
    }
    const db = getDb();
    const track = buildTrack(d, Math.max(d.lastAt, d.startedAt));
    const [lon, lat] = track.line[0]!;
    const plot = guessPlots(db.plots(), { lon, lat, accuracy: null })[0]?.plot ?? null;
    const farmId = plot?.farmId ?? current?.id ?? db.farms()[0]?.id;
    if (!farmId) return;
    db.saveRecord(session.user.id, session.organization.id, {
      farmId,
      plotId: plot?.id ?? null,
      poiId: null,
      kind: "track",
      data: track,
      lon,
      lat,
      gpsAccuracyM: null,
      capturedAt: d.startedAt,
    });
    discardWalk();
    setPending(null);
    localChanged();
    toastSaved();
    router.back();
  };

  const start = async () => {
    setDenied((await startWalk()) === "denied");
  };
  const finish = () => {
    const d = stopWalk();
    if (d) save(d);
  };
  const discard = () =>
    Alert.alert(t("app.walkDiscardConfirm"), undefined, [
      { text: t("ui.cancel"), style: "cancel" },
      {
        text: t("app.walkDiscard"),
        style: "destructive",
        onPress: () => {
          discardWalk();
          setPending(null);
        },
      },
    ]);

  const shown = recording ? draft : pending;
  return (
    <ScrollView style={k.screen} contentContainerStyle={k.pad}>
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{t("app.walkTitle")}</Text>
      {!recording && !pending && <Text style={[T.body, { marginTop: 12 }]}>{t("app.walkExplain")}</Text>}
      {shown && (
        <View style={{ marginTop: 28, gap: 20 }}>
          <View>
            <Text style={T.small}>{t("app.walkDistance")}</Text>
            <Text style={T.number}>{formatDistance(shown.distanceM)}</Text>
          </View>
          <View>
            <Text style={T.small}>{t("app.walkTime")}</Text>
            <Text style={T.number}>{formatDuration(durationS(shown, recording ? Date.now() : shown.lastAt))}</Text>
          </View>
          <Text style={T.small}>{shown.points.length === 0 ? t("app.walkWaiting") : t("app.walkPoints", { n: shown.points.length })}</Text>
        </View>
      )}
      {recording && <Text style={[T.small, { marginTop: 20 }]}>{t("app.walkRecordingHint")}</Text>}
      {denied && <Text style={[T.body, { marginTop: 16 }]}>{t("app.walkDenied")}</Text>}
      <View style={{ marginTop: 32 }}>
        {recording ? (
          <Button big title={t("app.walkStop")} onPress={finish} />
        ) : pending ? (
          <>
            <Button big title={t("app.walkStop")} onPress={() => save(pending)} />
            <Button kind="text" title={t("app.walkDiscard")} onPress={discard} style={{ marginTop: 8 }} />
          </>
        ) : (
          <Button big title={t("app.walkStart")} onPress={start} />
        )}
        {recording && <Button kind="text" title={t("app.walkDiscard")} onPress={discard} style={{ marginTop: 8 }} />}
      </View>
    </ScrollView>
  );
}
