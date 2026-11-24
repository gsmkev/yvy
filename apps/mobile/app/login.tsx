/** Ingreso: código por correo o vinculación con el QR del administrador. */
import { useEffect, useState } from "react";
import { ImageBackground, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { t, ATTRIBUTION } from "@yvy/shared";
import campo from "../assets/campo-itapua.webp";
import { markDemo } from "../src/lib/demo";
import { noteOrganizationEntry } from "../src/lib/org";
import { registerDevice } from "../src/lib/push";
import { API_URL, api, setSession, type Session } from "../src/lib/session";
import { deviceId } from "../src/lib/sync";
import { Button, Text, TextInput } from "../src/ui/kit";
import { C, F, GUTTER, RADIUS, T } from "../src/ui/theme";

/** Pantalla de ingreso. */
export default function Login() {
  const [mode, setMode] = useState<"choose" | "email" | "code" | "totp" | "phone">("choose");
  const [ticket, setTicket] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // La demo existe solo si el Worker la tiene configurada (GET /auth/demo responde ok).
  const [demoOn, setDemoOn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`${API_URL}/auth/demo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { available?: boolean } | null) => live && setDemoOn(j?.available === true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ImageBackground source={campo} resizeMode="cover" style={s.root}>
      <View style={s.shade} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.content}>
        <Text style={s.brand}>{t("ui.app.name")}</Text>
        <Text style={s.tagline}>{t("ui.common.tagline")}</Text>
        <View style={s.card}>
          {mode === "choose" && (
            <>
              <Button big title={t("app.login.qr")} onPress={() => router.push("/scan")} />
              <Button kind="secondary" title={t("app.login.phone")} onPress={() => setMode("phone")} style={{ marginTop: 10 }} />
              <Button kind="secondary" title={t("app.login.email")} onPress={() => setMode("email")} style={{ marginTop: 10 }} />
              {demoOn && (
                <Button
                  kind="text"
                  title={t("office.demo.seeExample")}
                  loading={busy}
                  style={{ marginTop: 6 }}
                  onPress={() =>
                    run(async () => {
                      const session = await api<Session>("POST", "/auth/demo", undefined, false);
                      markDemo(session.organization.id); // antes de guardar la sesión: la franja y el solo lectura ya la ven
                      await setSession(session);
                      router.replace("/(tabs)");
                    })
                  }
                />
              )}
            </>
          )}
          {mode === "phone" && (
            <>
              <Text style={T.bodyMedium}>{t("app.login.phoneLabel")}</Text>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                autoFocus
                accessibilityLabel={t("app.login.phoneLabel")}
              />
              <Text style={T.bodyMedium}>{t("app.login.pinLabel")}</Text>
              <TextInput
                style={[s.input, s.code]}
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                accessibilityLabel={t("app.login.pinLabel")}
              />
              <Text style={[T.small, { marginBottom: 12 }]}>{t("app.login.pinHint")}</Text>
              <Button
                big
                title={t("app.login.phoneSubmit")}
                loading={busy}
                disabled={phone.replace(/\D/g, "").length < 6 || pin.length !== 6}
                onPress={() =>
                  run(async () => {
                    const session = await api<Session>("POST", "/auth/pin/login", { phone: phone.trim(), pin, deviceId: deviceId() }, false);
                    setPin("");
                    await setSession(session);
                    noteOrganizationEntry(session);
                    registerDevice();
                    router.replace("/(tabs)");
                  })
                }
              />
              <Button kind="text" title={t("ui.common.cancel")} onPress={() => (setPin(""), setMode("choose"))} style={{ marginTop: 6 }} />
            </>
          )}
          {mode === "email" && (
            <>
              <Text style={T.bodyMedium}>{t("auth.email.label")}</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                autoFocus
                accessibilityLabel={t("auth.email.label")}
              />
              <Button
                big
                title={t("auth.common.sendCode")}
                loading={busy}
                disabled={!email.includes("@")}
                onPress={() =>
                  run(async () => {
                    await api("POST", "/auth/email/start", { email: email.trim().toLowerCase() }, false);
                    setMode("code");
                  })
                }
              />
              <Button kind="text" title={t("ui.common.cancel")} onPress={() => setMode("choose")} style={{ marginTop: 6 }} />
            </>
          )}
          {mode === "code" && (
            <>
              <Text style={T.small}>{t("auth.code.sent", { email })}</Text>
              <TextInput
                style={[s.input, s.code]}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                autoFocus
                accessibilityLabel={t("auth.code.label")}
              />
              <Button
                big
                title={t("ui.common.verify")}
                loading={busy}
                disabled={code.length !== 6}
                onPress={() =>
                  run(async () => {
                    const res = await api<Session | { mfaRequired: true; ticket: string }>("POST", "/auth/email/verify", { email: email.trim().toLowerCase(), code, deviceId: deviceId() }, false);
                    // Con segundo factor, el servidor pide un código más antes de dar la sesión
                    if ("mfaRequired" in res) {
                      setTicket(res.ticket);
                      setMode("totp");
                      return;
                    }
                    await setSession(res);
                    noteOrganizationEntry(res);
                    registerDevice();
                    router.replace("/(tabs)");
                  })
                }
              />
              <Button kind="text" title={t("ui.common.resend")} onPress={() => setMode("email")} style={{ marginTop: 6 }} />
            </>
          )}
          {mode === "totp" && (
            <>
              <Text style={T.small}>{t("ui.totp.loginHelp")}</Text>
              <TextInput
                style={[s.input, s.code]}
                value={totpCode}
                onChangeText={(v) => setTotpCode(v.trim().slice(0, 20))}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                autoFocus
                accessibilityLabel={t("ui.totp.loginLabel")}
              />
              <Button
                big
                title={t("ui.common.verify")}
                loading={busy}
                disabled={totpCode.length < 6}
                onPress={() =>
                  run(async () => {
                    const session = await api<Session>("POST", "/auth/totp/login", { ticket, code: totpCode }, false);
                    setTotpCode("");
                    await setSession(session);
                    noteOrganizationEntry(session);
                    registerDevice();
                    router.replace("/(tabs)");
                  })
                }
              />
              <Button kind="text" title={t("ui.common.cancel")} onPress={() => (setTotpCode(""), setMode("choose"))} style={{ marginTop: 6 }} />
            </>
          )}
          {error && <Text style={[T.small, { color: C.peligro, marginTop: 10 }]}>{error}</Text>}
        </View>
        <Text style={s.credit}>{t("ui.login.credit", { source: t(ATTRIBUTION.copernicus) })}</Text>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#141a12" },
  shade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,26,18,0.35)" },
  content: { flex: 1, justifyContent: "flex-end", padding: GUTTER, paddingBottom: 28 },
  brand: { fontFamily: F.serif, fontSize: 56, lineHeight: 60, color: C.papel, letterSpacing: -1 },
  tagline: { fontFamily: F.sans, fontSize: 18, lineHeight: 24, color: "rgba(251,250,245,0.85)", marginTop: 4, marginBottom: 20, maxWidth: 300 },
  card: { backgroundColor: C.papel, borderRadius: RADIUS + 4, padding: GUTTER },
  input: { ...T.body, backgroundColor: C.blanco, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, minHeight: 56, marginTop: 8, marginBottom: 14 },
  code: { ...T.number, fontSize: 36, lineHeight: 44, textAlign: "center", letterSpacing: 8, minHeight: 72 },
  credit: { fontFamily: F.sans, fontSize: 11, color: "rgba(251,250,245,0.6)", marginTop: 12 },
});
