/**
 * Emergencia: un botón que arma un SMS con la ubicación y la hora y abre la app de mensajes con los contactos
 * de emergencia. Anda sin datos (solo hace falta señal de voz): el GPS no usa internet y el SMS sale por la red celular.
 * El envío lo confirma la persona en la app de mensajes; Yvy no manda nada sola.
 */
import { useState } from "react";
import { Alert, Linking, Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { addContact, emergencyText, parseContacts, smsUrl, type EmergencyContact } from "../src/lib/emergencySms";
import { currentFix, type Fix } from "../src/lib/location";
import { getSession } from "../src/lib/session";
import { showToast } from "../src/lib/toast";
import { Phone } from "lucide-react-native";
import { Button, Row, ScreenBody, SectionHeader, s as k, Text, TextInput } from "../src/ui/kit";
import { C, RADIUS, T } from "../src/ui/theme";

const KEY = "emergency_contacts";

/** Emergencia: envío de un SMS con la ubicación a los contactos configurados. */
export default function Emergency() {
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => parseContacts(getDb().getKv(KEY)));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const save = (list: EmergencyContact[]) => {
    setContacts(list);
    getDb().setKv(KEY, JSON.stringify(list));
    showToast(t("app.toast.savedLocal"));
  };

  const add = () => {
    const r = addContact(contacts, name, phone);
    if (!r.ok) return Alert.alert(t(`app.emergency.addError_${r.reason}`, { n: 5 }));
    save(r.list);
    setName("");
    setPhone("");
  };

  const remove = (c: EmergencyContact) =>
    Alert.alert(t("app.emergency.removeTitle", { name: c.name || c.phone }), undefined, [
      { text: t("ui.common.cancel"), style: "cancel" },
      { text: t("app.emergency.remove"), style: "destructive", onPress: () => save(contacts.filter((x) => x.phone !== c.phone)) },
    ]);

  const send = async () => {
    setBusy(true);
    try {
      // Con el último punto conocido alcanza si el GPS tarda: en una emergencia importa más salir rápido que ser exacto.
      const fix: Fix | null = await currentFix(8_000);
      const body = emergencyText(getSession()?.user.fullName ?? "", fix, Date.now());
      await Linking.openURL(smsUrl(contacts.map((c) => c.phone), body, Platform.OS));
    } catch {
      Alert.alert(t("app.emergency.smsFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={k.screen}>
      <Stack.Screen options={{ title: "" }} />
      <ScreenBody
        footer={
          <>
            <Text style={[T.small, { textAlign: "center" }]}>{contacts.length ? t("app.emergency.sendTo", { n: contacts.length }) : t("app.emergency.noContacts")}</Text>
            <Button big kind="danger" title={t("app.emergency.send")} loading={busy} onPress={send} />
          </>
        }
      >
        <Text style={T.title}>{t("app.emergency.title")}</Text>
        <Text style={[T.small, { marginTop: 4 }]}>{t("app.emergency.intro")}</Text>

        <SectionHeader title={t("app.emergency.contacts")} />
        {contacts.map((c) => (
          <Row key={c.phone} icon={Phone} title={c.name || c.phone} subtitle={c.name ? c.phone : undefined} onPress={() => remove(c)} right={<Text style={[T.smallMedium, { color: C.peligro }]}>{t("app.emergency.remove")}</Text>} />
        ))}

        <View style={{ marginTop: 14, gap: 8 }}>
          <TextInput
            style={st.input}
            value={name}
            onChangeText={setName}
            placeholder={t("app.emergency.namePlaceholder")}
            accessibilityLabel={t("app.emergency.namePlaceholder")}
            autoComplete="name"
          />
          <TextInput
            style={st.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={t("app.emergency.phonePlaceholder")}
            accessibilityLabel={t("app.emergency.phonePlaceholder")}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <Button kind="secondary" title={t("app.emergency.add")} onPress={add} disabled={phone.replace(/\D/g, "").length < 6} />
        </View>
      </ScreenBody>
    </View>
  );
}

const st = StyleSheet.create({
  input: { ...T.body, backgroundColor: C.blanco, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, minHeight: 56 },
});
