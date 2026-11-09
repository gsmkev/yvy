import { CheckCircle2, Download, LogOut, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { downloadPack, isWifi, packStatus } from "../../src/lib/offline";
import { api, getSession, setSession } from "../../src/lib/session";
import { localChanged, syncNow } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { Button, Header, Muted, styles as k } from "../../src/ui/kit";
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
      <Header eyebrow={session?.organization.name} title={session?.user.fullName ?? ""} />
      <Button title={t("app.syncNow")} icon={RefreshCw} onPress={syncNow} />

      {rejected.map((r) => (
        <View key={r.mutationId} style={s.card}>
          <Text style={{ color: C.alerta, fontWeight: "700" }}>{t("app.rejected")}</Text>
          <Text>{t(`rejectReasons.${r.reason}` as never, { max: 3 })}</Text>
          <Button
            title={t("app.dismiss")}
            variant="secondary"
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
              <View style={s.row}>
                <CheckCircle2 size={18} color={C.accion} />
                <Text style={{ color: C.accion, fontWeight: "600" }}>{t("app.offlinePackReady")}</Text>
              </View>
            ) : (
              <>
                <Muted>
                  {t("app.offlinePackSize", {
                    mb: (st.missingBytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 }),
                  })}
                </Muted>
                {p !== undefined ? (
                  <Text style={s.progress}>{Math.round(p * 100)} %</Text>
                ) : (
                  <Button title={t("app.offlinePackDownload")} icon={Download} onPress={() => download(f.id)} />
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

      <Button title={t("app.logout")} variant="danger" icon={LogOut} onPress={logout} />
      <Muted>
        {t("attribution.metNorway")} · {t("attribution.copernicus")} · {t("attribution.chirps")} ·{" "}
        {t("attribution.firms")}
      </Muted>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h2: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "monospace",
    color: C.tinta2,
    marginTop: 12,
  },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.linea, borderRadius: 12, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  farm: { fontSize: 17, fontWeight: "700", color: C.surco },
  progress: { fontSize: 22, fontWeight: "700", color: C.accion },
});
