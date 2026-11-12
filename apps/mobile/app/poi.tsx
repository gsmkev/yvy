/**
 * Marcar punto de interés (F-07): ubicación actual del GPS, tipo y nombre. Se guarda local y se manda con señal.
 * Solo roles que no son empleado (PRD §9); el servidor también lo exige.
 */
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { router, Stack } from "expo-router";
import { isFieldRole, LIMITS, POI_KINDS, t, type MessageKey } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { currentFix, guessPlots, type Fix } from "../src/lib/location";
import { useSession } from "../src/lib/session";
import { localChanged } from "../src/lib/sync";
import { toastSaved } from "../src/lib/toast";
import { Button, Row, s as k, Text, TextInput } from "../src/ui/kit";
import { C, RADIUS, T } from "../src/ui/theme";
import { gpsHintText, useGpsStage } from "../src/lib/gpsHint";
import { withWriteAccess } from "../src/ui/ReadOnlyGate";

function MarkPoi() {
  const session = useSession();
  const [fix, setFix] = useState<Fix | null | "searching">("searching");
  const [kind, setKind] = useState<(typeof POI_KINDS)[number]>("other");
  const [name, setName] = useState("");
  const gpsHint = gpsHintText(useGpsStage(fix === "searching"));

  useEffect(() => {
    currentFix().then(setFix);
  }, []);

  if (!session || isFieldRole(session.organization.role)) return null;
  const here = fix === "searching" ? null : fix;

  const save = () => {
    if (!here) return;
    const db = getDb();
    // La estancia del lote en que estamos; si no, la primera.
    const guess = guessPlots(db.plots(), here)[0]?.plot.farmId;
    const farmId = guess ?? db.farms()[0]?.id;
    if (!farmId) return;
    db.savePoi(session.organization.id, { farmId, kind, name: name.trim() || t(`ui.poiKinds_${kind}` as MessageKey), lon: here.lon, lat: here.lat });
    localChanged();
    toastSaved();
    router.back();
  };

  return (
    <ScrollView style={k.screen} contentContainerStyle={k.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{t("app.poiTitle")}</Text>
      <Text style={[T.small, { marginTop: 6 }]}>{fix === "searching" ? t("app.gpsSearching") : here ? t("app.gpsOk", { m: Math.round(here.accuracy ?? 0) }) : t("app.poiNoGps")}</Text>
      {fix === "searching" && gpsHint && <Text style={[T.small, { marginTop: 6 }]}>{gpsHint}</Text>}
      {!here && fix !== "searching" && <Text style={[T.small, { marginTop: 6 }]}>{t("app.gpsNoneHint")}</Text>}
      <Text style={[T.heading, { marginTop: 24, marginBottom: 4 }]}>{t("app.poiWhat")}</Text>
      {POI_KINDS.map((kd) => (
        <Row key={kd} title={t(`ui.poiKinds_${kd}` as MessageKey)} selected={kind === kd} onPress={() => setKind(kd)} />
      ))}
      <Text style={[T.heading, { marginTop: 24, marginBottom: 8 }]}>{t("app.poiName")}</Text>
      <TextInput
        value={name}
        onChangeText={(v) => setName(v.slice(0, LIMITS.sync.maxPoiNameLength))}
        placeholder={t("app.poiNamePlaceholder")}
        placeholderTextColor={C.tinta3}
        accessibilityLabel={t("app.poiName")}
        style={st.input}
      />
      <Button big title={t("app.poiSave")} disabled={!here} onPress={save} style={{ marginTop: 28 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  input: { ...T.body, minHeight: 56, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, backgroundColor: C.blanco },
});

/** F-29: en solo lectura esta pantalla no se abre. */
export default withWriteAccess(MarkPoi);
