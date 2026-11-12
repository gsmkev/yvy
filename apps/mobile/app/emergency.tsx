/**
 * Emergencia (F-30): un botón que arma un SMS con la ubicación y la hora y abre la app de mensajes con los contactos
 * de emergencia. Anda sin datos (solo hace falta señal de voz): el GPS no usa internet y el SMS sale por la red celular.
 * El envío lo confirma la persona en la app de mensajes; Yvy no manda nada sola.
 */
import { useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { addContact, emergencyText, parseContacts, smsUrl, type EmergencyContact } from "../src/lib/emergencySms";
import { currentFix, type Fix } from "../src/lib/location";
import { getSession } from "../src/lib/session";
import { Button, Row, s as k, Text, TextInput } from "../src/ui/kit";
import { C, GUTTER, RADIUS, T } from "../src/ui/theme";

const KEY = "emergency_contacts";

export default function Emergency() {
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => parseContacts(getDb().getKv(KEY)));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const save = (list: EmergencyContact[]) => {
    setContacts(list);
    getDb().setKv(KEY, JSON.stringify(list));
  };

  const add = () => {
    const r = addContact(contacts, name, phone);
    if (!r.ok) return Alert.alert(t(`app.emergencyAddError_${r.reason}` as never, { n: 5 }));
    save(r.list);
    setName("");
    setPhone("");
  };

  const remove = (c: EmergencyContact) =>
    Alert.alert(t("app.emergencyRemoveTitle", { name: c.name || c.phone }), undefined, [
      { text: t("ui.cancel"), style: "cancel" },
      { text: t("app.emergencyRemove"), style: "destructive", onPress: () => save(contacts.filter((x) => x.phone !== c.phone)) },
    ]);

  const send = async () => {
    setBusy(true);
    try {
      // Con el último punto conocido alcanza si el GPS tarda: en una emergencia importa más salir rápido que ser exacto.
      const fix: Fix | null = await currentFix(8_000);
      const body = emergencyText(getSession()?.user.fullName ?? "", fix, Date.now());
      await Linking.openURL(smsUrl(contacts.map((c) => c.phone), body, Platform.OS));
    } catch {
      Alert.alert(t("app.emergencySmsFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={k.screen} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.display}>{t("app.emergencyTitle")}</Text>
      <Text style={[T.small, { marginTop: 4 }]}>{t("app.emergencyIntro")}</Text>

      <Button big kind="danger" title={t("app.emergencySend")} loading={busy} onPress={send} style={{ marginTop: 20 }} />
      <Text style={[T.small, { marginTop: 8 }]}>{contacts.length ? t("app.emergencySendTo", { n: contacts.length }) : t("app.emergencyNoContacts")}</Text>

      <Text style={[T.bodyMedium, { marginTop: 28, marginBottom: 6 }]}>{t("app.emergencyContacts")}</Text>
      {contacts.map((c) => (
        <Row key={c.phone} title={c.name || c.phone} subtitle={c.name ? c.phone : undefined} onPress={() => remove(c)} right={<Text style={[T.smallMedium, { color: C.peligro }]}>{t("app.emergencyRemove")}</Text>} />
      ))}

      <View style={{ marginTop: 14, gap: 8 }}>
        <TextInput
          style={st.input}
          value={name}
          onChangeText={setName}
          placeholder={t("app.emergencyNamePlaceholder")}
          accessibilityLabel={t("app.emergencyNamePlaceholder")}
          autoComplete="name"
        />
        <TextInput
          style={st.input}
          value={phone}
          onChangeText={setPhone}
          placeholder={t("app.emergencyPhonePlaceholder")}
          accessibilityLabel={t("app.emergencyPhonePlaceholder")}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Button kind="secondary" title={t("app.emergencyAdd")} onPress={add} disabled={phone.replace(/\D/g, "").length < 6} />
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  input: { ...T.body, backgroundColor: C.blanco, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, minHeight: 56 },
});
