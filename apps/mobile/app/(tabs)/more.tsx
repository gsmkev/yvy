import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { downloadPack, isWifi, packStatus } from "../../src/lib/offline";
import { api, getSession, setSession } from "../../src/lib/session";
import { localChanged, stopAutoSync, syncNow, useSyncStatus } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { Button, Row, s as k } from "../../src/ui/kit";
import { C, F, T } from "../../src/ui/theme";

export default function More() {
  const farms = useLocal(() => getDb().farms());
  const rejected = useLocal(() => getDb().rejected());
  const sync = useSyncStatus();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [wifiOnly, setWifiOnly] = useState(getDb().getKv("photos_wifi_only") === "1");
  const session = getSession();
  const lastSync = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString("es-PY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

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
    stopAutoSync();
    getDb().wipeSynced();
    await setSession(null);
    router.replace("/login");
  };

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]}>
      <Text style={T.small}>{session?.organization.name}</Text>
      <Text style={[T.display, { marginTop: 2 }]}>{session?.user.fullName}</Text>

      <Text style={st.section}>{t("app.syncTitle")}</Text>
      <Row title={t("app.lastSyncAt", { when: lastSync })} subtitle={sync.pending > 0 ? t("app.pendingCount", { n: sync.pending }) : t("app.allSent")} onPress={syncNow} />
      {rejected.map((r) => (
        <View key={r.mutationId} style={st.rejected}>
          <Text style={[T.bodyMedium, { color: C.peligro }]}>{t("app.rejected")}</Text>
          <Text style={[T.small, { marginTop: 2 }]}>{t(`rejectReasons.${r.reason}` as never, { max: 3 })}</Text>
          <Button kind="text" title={t("app.dismiss")} onPress={() => (getDb().dismissRejected(r.mutationId), localChanged())} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        </View>
      ))}

      <Text style={st.section}>{t("app.offlinePack")}</Text>
      {farms.map((f) => {
        const p = packStatus(f.id);
        const pct = progress[f.id];
        const subtitle = !p.layers.length
          ? t("app.offlinePackNone")
          : p.upToDate
            ? t("app.offlinePackReady")
            : pct !== undefined
              ? `${Math.round(pct * 100)} %`
              : t("app.offlinePackSize", { mb: (p.missingBytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 }) });
        return <Row key={f.id} title={f.name} subtitle={subtitle} onPress={p.layers.length && !p.upToDate && pct === undefined ? () => download(f.id) : undefined} right={p.layers.length && !p.upToDate && pct === undefined ? <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{t("app.download")}</Text> : undefined} />;
      })}

      <View style={[st.switchRow]}>
        <Text style={[T.body, { flex: 1 }]}>{t("app.photosWifiOnly")}</Text>
        <Switch value={wifiOnly} onValueChange={(v) => (setWifiOnly(v), getDb().setKv("photos_wifi_only", v ? "1" : "0"))} trackColor={{ true: C.accion }} />
      </View>

      <Button kind="danger" title={t("app.logout")} onPress={logout} style={{ marginTop: 32 }} />
      <Text style={[T.small, { marginTop: 28, color: C.tinta3 }]}>
        {t("attribution.metNorway")} · {t("attribution.copernicus")} · {t("attribution.chirps")} · {t("attribution.firms")}
      </Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  section: { fontFamily: F.sansSemi, fontSize: 15, color: C.tinta2, marginTop: 32, marginBottom: 4 },
  rejected: { backgroundColor: C.peligroSuave, borderRadius: 12, padding: 16, marginTop: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.linea },
});
