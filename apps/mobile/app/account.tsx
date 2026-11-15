/** Cuenta y ajustes: avisos, recordatorios, idioma, cambio de usuario y cierre de sesión. */
import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { router } from "expo-router";
import { Bell, Languages, UserRoundCog } from "lucide-react-native";
import { getLocale, LOCALES, LOCALE_NAMES, t } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { remindersEnabled, setRemindersEnabled } from "../src/lib/reminders";
import { chooseLocale } from "../src/lib/locale";
import { api, getSession, setSession } from "../src/lib/session";
import { canSwitchUser, unsentSummary } from "../src/lib/switchUser";
import { isOwnerMode } from "../src/lib/ownerSummary";
import { stopAutoSync } from "../src/lib/sync";
import { setReadOnly, useReadOnly } from "../src/lib/readOnly";
import { Button, ChoiceSheet, Row, SectionHeader, SwitchRow, s as k, Text } from "../src/ui/kit";
import { T } from "../src/ui/theme";

export default function Account() {
  const [reminders, setReminders] = useState(remindersEnabled());
  const [langOpen, setLangOpen] = useState(false);
  const session = getSession();
  const readOnly = useReadOnly();

  /** Cierra la sesión de esta persona. Solo si no queda nada sin mandar (ver lib/switchUser.ts). */
  const leave = async () => {
    const s = getSession();
    if (s) await api("POST", "/auth/logout", { refreshToken: s.refreshToken }, false).catch(() => {});
    stopAutoSync();
    getDb().wipeSynced();
    await setSession(null);
    router.replace("/login");
  };

  const guarded = (then: () => void) => {
    const block = canSwitchUser(unsentSummary(getDb()));
    if (!block.blocked) return then();
    if (block.reason === "rejected") return Alert.alert(t("app.switchBlockedRejected", { n: block.n }));
    Alert.alert(t(block.n === 1 ? "app.switchBlockedPendingOne" : "app.switchBlockedPending", { n: block.n }));
  };

  const logout = () =>
    guarded(() => {
      void leave();
    });

  const switchUser = () =>
    guarded(() =>
      Alert.alert(t("app.switchConfirmTitle"), t("app.switchConfirmBody"), [
        { text: t("ui.cancel"), style: "cancel" },
        { text: t("app.switchConfirmYes"), onPress: () => void leave() },
      ]),
    );

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 80 }]}>
      <Text style={T.small}>{session?.organization.name}</Text>
      <Text style={[T.title, { marginTop: 2 }]}>{t("app.accountRow")}</Text>

      <SectionHeader first title={t("app.sectionAccount")} />
      <Row icon={Bell} title={t("app.notifRow")} subtitle={t("app.notifRowHint")} onPress={() => router.push("/notifications")} />
      <SwitchRow
        title={t("app.remindersSwitch")}
        hint={t("app.remindersHint")}
        value={reminders}
        onValueChange={async (v) => {
          const on = await setRemindersEnabled(v);
          setReminders(on);
          if (v && !on) Alert.alert(t("app.remindersDenied"));
        }}
      />
      {isOwnerMode(session?.organization.role) && <SwitchRow title={t("app.readOnlySwitch")} hint={t("app.readOnlyHint")} value={readOnly} onValueChange={setReadOnly} />}
      <Row
        icon={Languages}
        title={t("app.language")}
        subtitle={LOCALE_NAMES[getLocale()]}
        onPress={() => setLangOpen(true)}
      />
      <Row icon={UserRoundCog} title={t("app.switchUser")} subtitle={t("app.switchUserHint")} onPress={switchUser} />
      <Button kind="danger" title={t("app.logout")} onPress={logout} style={{ marginTop: 32 }} />

      <ChoiceSheet
        visible={langOpen}
        title={t("app.languageChoose")}
        value={getLocale()}
        options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
        onClose={() => setLangOpen(false)}
        onSelect={(l) => {
          setLangOpen(false);
          chooseLocale(getDb(), l);
          router.replace("/");
        }}
      />
    </ScrollView>
  );
}
