import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { downloadPack, isWifi, packStatus } from "../../src/lib/offline";
import { api, getSession, setSession } from "../../src/lib/session";
import { localChanged, syncNow } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { Button, H1, Muted, styles as k } from "../../src/ui/kit";
import { C } from "../../src/ui/theme";

export default function More() {
  const farms = useLocal(() => getDb().farms());
  const rejected = useLocal(() => getDb().rejected());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [wifiOnly, setWifiOnly] = useState(getDb().getKv("photos_wifi_only") === "1");
  const session = getSession();

  const download = async (farmId: string) => {
    if (!(await isWifi())) return Alert.alert(t("app.offlinePackNeedsWifi"));
    try {
      await downloadPack(farmId, (f) => setProgress((p) => ({ ...p, [farmId]: f })));
      localChanged();
    } catch (e) {
      Alert.alert(String(e));
    } finally {
      setProgress((p) => {
        const { [farmId]: _, ...rest } = p;
        return rest;
      });
    }
  };

  const logout = async () => {
    const pending = getDb().pendingCount();
    if (pending > 0) return Alert.alert(t("app.logoutPending", { n: pending }));
    const s = getSession();
    if (s) await api("POST", "/auth/logout", { refreshToken: s.refreshToken }, false).catch(() => {});
    getDb().wipeSynced();
    await setSession(null);
    router.replace("/login");
  };

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { gap: 14 }]}>
      <H1>{session?.user.fullName}</H1>
      <Muted>{session?.organization.name}</Muted>
      <Button title={t("app.syncNow")} icon="↻" onPress={syncNow} />

      {rejected.map((r) => (
        <View key={r.mutationId} style={s.card}>
          <Text style={{ color: C.alerta, fontWeight: "700" }}>{t("app.rejected")}</Text>
          <Text>{t(`rejectReasons.${r.reason}` as never, { max: 3 })}</Text>
          <Button
            title={t("app.dismiss")}
            variant="ghost"
            onPress={() => (getDb().dismissRejected(r.mutationId), localChanged())}
          />
        </View>
      ))}

      <Text style={s.h2}>{t("app.offlinePack")}</Text>
      {farms.map((f) => {
        const st = packStatus(f.id);
        const p = progress[f.id];
        return (
          <View key={f.id} style={s.card}>
            <Text style={s.farm}>{f.name}</Text>
            {!st.layers.length ? (
              <Muted>{t("app.offlinePackNone")}</Muted>
            ) : st.upToDate ? (
              <Text style={{ color: C.soja, fontWeight: "600" }}>✔ {t("app.offlinePackReady")}</Text>
            ) : (
              <>
                <Muted>{t("app.offlinePackSize", { mb: (st.missingBytes / 1e6).toFixed(1) })}</Muted>
                {p !== undefined ? (
                  <Text style={s.progress}>{Math.round(p * 100)} %</Text>
                ) : (
                  <Button title={t("app.offlinePackDownload")} icon="⤓" onPress={() => download(f.id)} />
                )}
              </>
            )}
          </View>
        );
      })}

      <View style={[s.card, s.row]}>
        <Text style={{ flex: 1, fontSize: 16 }}>{t("app.photosWifiOnly")}</Text>
        <Switch
          value={wifiOnly}
          onValueChange={(v) => (setWifiOnly(v), getDb().setKv("photos_wifi_only", v ? "1" : "0"))}
          trackColor={{ true: C.soja }}
        />
      </View>

      <Button title={t("app.logout")} variant="ghost" onPress={logout} />
      <Muted>
        {t("attribution.metNorway")} · {t("attribution.copernicus")} · {t("attribution.chirps")} ·{" "}
        {t("attribution.firms")}
      </Muted>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h2: { fontSize: 18, fontWeight: "700", color: C.surco, marginTop: 8 },
  card: { backgroundColor: C.white, borderRadius: 12, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center" },
  farm: { fontSize: 17, fontWeight: "700", color: C.surco },
  progress: { fontSize: 22, fontWeight: "700", color: C.soja },
});
