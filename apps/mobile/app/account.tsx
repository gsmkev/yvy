/** Cuenta y ajustes: avisos, recordatorios, idioma, cambio de usuario y cierre de sesión. */
import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { router } from "expo-router";
import { Bell, Building2, Languages, UserRoundCog } from "lucide-react-native";
import { getLocale, LOCALES, LOCALE_NAMES, t, type MessageKey } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { remindersEnabled, setRemindersEnabled } from "../src/lib/reminders";
import { chooseLocale } from "../src/lib/locale";
import { api, getSession, setSession, type Session } from "../src/lib/session";
import { canSwitchUser, unsentSummary } from "../src/lib/switchUser";
import { isOwnerMode } from "../src/lib/ownerSummary";
import { deviceId, startAutoSync, stopAutoSync } from "../src/lib/sync";
import { setReadOnly, useReadOnly } from "../src/lib/readOnly";
import { Button, ChoiceSheet, Row, SectionHeader, SwitchRow, s as k, Text } from "../src/ui/kit";
import { T } from "../src/ui/theme";

export default function Account() {
  const [reminders, setReminders] = useState(remindersEnabled());
  const [langOpen, setLangOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const session = getSession();
  const orgs = session?.organizations ?? [];
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

  /** Agrónomo con varios clientes: otra organización = otra base local, igual que cambiar de usuario (se limpia lo bajado). */
  const switchOrg = (id: string) => {
    setOrgOpen(false);
    const target = orgs.find((o) => o.id === id);
    if (!target || id === session?.organization.id) return;
    const block = canSwitchUser(unsentSummary(getDb()));
    if (block.blocked) {
      const key: MessageKey = block.reason === "rejected" ? "office.orgSwitchBlockedRejected" : "office.orgSwitchBlockedPending";
      return Alert.alert(t(key, { n: block.n }));
    }
    Alert.alert(t("office.orgSwitchConfirmTitle", { name: target.name }), t("office.orgSwitchConfirmBody"), [
      { text: t("ui.cancel"), style: "cancel" },
      {
        text: t("office.orgSwitchConfirmYes"),
        onPress: async () => {
          try {
            // Primero el servidor: si falla, no se toca nada local.
            const next = await api<Session>("POST", "/auth/switch", { organizationId: id, deviceId: deviceId() });
            stopAutoSync();
            getDb().wipeSynced(); // también borra la caché de lecturas en línea
            await setSession(next);
            startAutoSync();
            router.replace("/");
          } catch {
            Alert.alert(t("ui.orgSwitchFailed"));
          }
        },
      },
    ]);
  };

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
      {orgs.length > 1 && <Row icon={Building2} title={t("ui.orgSwitch")} subtitle={t("office.orgSwitchHint", { name: session?.organization.name ?? "" })} onPress={() => setOrgOpen(true)} />}
      <Row icon={UserRoundCog} title={t("app.switchUser")} subtitle={t("app.switchUserHint")} onPress={switchUser} />
      <Button kind="danger" title={t("app.logout")} onPress={logout} style={{ marginTop: 32 }} />

      <ChoiceSheet
        visible={orgOpen}
        title={t("ui.orgSwitch")}
        value={session?.organization.id}
        options={orgs.map((o) => ({ value: o.id, label: o.name, hint: o.id === session?.organization.id ? t("ui.orgCurrent") : t(`ui.role_${o.role}` as MessageKey) }))}
        onClose={() => setOrgOpen(false)}
        onSelect={switchOrg}
      />
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
