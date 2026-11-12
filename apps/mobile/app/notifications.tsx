/**
 * Preferencias de avisos (U-29): por tipo de aviso, y horario de silencio para el push. Se guardan en el servidor
 * (valen para todos los dispositivos), así que hace falta señal para verlas y cambiarlas.
 */
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import { Stack } from "expo-router";
import {
  DEFAULT_NOTIFICATION_PREFS,
  isTimeOfDay,
  t,
  type MessageKey,
  type NotificationPrefs,
  type NotifyKind,
} from "@yvy/shared";
import { api } from "../src/lib/session";
import { toastSaved } from "../src/lib/toast";
import { Button, s as k, Text, TextInput } from "../src/ui/kit";
import { C, T } from "../src/ui/theme";

interface Resp {
  prefs: NotificationPrefs;
  kinds: NotifyKind[];
  email: boolean;
}

export default function Notifications() {
  const [data, setData] = useState<Resp | null>(null);
  const [offline, setOffline] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    api<Resp>("GET", "/me/notification-prefs")
      .then((r) => {
        setData(r);
        setPrefs(r.prefs);
      })
      .catch(() => setOffline(true));
  }, []);

  const quietOk =
    !prefs.quiet.enabled ||
    (isTimeOfDay(prefs.quiet.start) && isTimeOfDay(prefs.quiet.end) && prefs.quiet.start !== prefs.quiet.end);
  const set = (kind: NotifyKind, ch: "push" | "email", v: boolean) =>
    setPrefs({ ...prefs, kinds: { ...prefs.kinds, [kind]: { ...prefs.kinds[kind], [ch]: v } } });
  const save = async () => {
    try {
      const r = await api<Resp>("PUT", "/me/notification-prefs", prefs);
      setData(r);
      toastSaved();
    } catch {
      setOffline(true);
    }
  };

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 80 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{t("app.notifRow")}</Text>
      {offline && <Text style={[T.small, { marginTop: 8, color: C.peligro }]}>{t("app.notifNeedsSignal")}</Text>}
      {data && (
        <>
          <Text style={[T.small, { marginTop: 6 }]}>{t("ui.notifIntro")}</Text>
          {data.kinds.map((kind) => (
            <View key={kind} style={st.row}>
              <Text style={[T.body, { flex: 1 }]}>{t(`ui.notifKind_${kind}` as MessageKey)}</Text>
              <View style={st.switchCol}>
                <Text style={T.small}>{t("ui.notifPush")}</Text>
                <Switch value={prefs.kinds[kind].push} onValueChange={(v) => set(kind, "push", v)} trackColor={{ true: C.accion }} />
              </View>
              {data.email && (
                <View style={st.switchCol}>
                  <Text style={T.small}>{t("ui.notifEmail")}</Text>
                  <Switch value={prefs.kinds[kind].email} onValueChange={(v) => set(kind, "email", v)} trackColor={{ true: C.accion }} />
                </View>
              )}
            </View>
          ))}
          <Text style={[T.heading, { marginTop: 24 }]}>{t("ui.notifQuietTitle")}</Text>
          <View style={st.row}>
            <Text style={[T.body, { flex: 1 }]}>{t("ui.notifQuietSwitch")}</Text>
            <Switch value={prefs.quiet.enabled} onValueChange={(v) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, enabled: v } })} trackColor={{ true: C.accion }} />
          </View>
          {prefs.quiet.enabled && (
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={T.small}>{t("ui.notifQuietFrom")}</Text>
                <TextInput value={prefs.quiet.start} onChangeText={(v) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, start: v } })} placeholder="21:00" keyboardType="numbers-and-punctuation" maxLength={5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={T.small}>{t("ui.notifQuietTo")}</Text>
                <TextInput value={prefs.quiet.end} onChangeText={(v) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, end: v } })} placeholder="06:00" keyboardType="numbers-and-punctuation" maxLength={5} />
              </View>
            </View>
          )}
          <Text style={[T.small, { marginTop: 8 }]}>{t("ui.notifQuietHint")}</Text>
          <Button kind="primary" title={t("ui.notifSave")} onPress={save} disabled={!quietOk} style={{ marginTop: 20 }} />
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.linea },
  switchCol: { alignItems: "center", gap: 2 },
});
