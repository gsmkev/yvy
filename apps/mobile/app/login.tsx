import { useState } from "react";
import { ImageBackground, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import campo from "../assets/campo-itapua.webp";
import { registerDevice } from "../src/lib/push";
import { api, setSession, type Session } from "../src/lib/session";
import { deviceId } from "../src/lib/sync";
import { Button } from "../src/ui/kit";
import { C, F, GUTTER, RADIUS, T } from "../src/ui/theme";

export default function Login() {
  const [mode, setMode] = useState<"choose" | "email" | "code">("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <Text style={s.brand}>Yvy</Text>
        <Text style={s.tagline}>{t("ui.tagline")}</Text>
        <View style={s.card}>
          {mode === "choose" && (
            <>
              <Button big title={t("app.loginQr")} onPress={() => router.push("/scan")} />
              <Button kind="secondary" title={t("app.loginEmail")} onPress={() => setMode("email")} style={{ marginTop: 10 }} />
            </>
          )}
          {mode === "email" && (
            <>
              <Text style={T.bodyMedium}>{t("auth.emailLabel")}</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                autoFocus
                accessibilityLabel={t("auth.emailLabel")}
              />
              <Button
                big
                title={t("auth.sendCode")}
                loading={busy}
                disabled={!email.includes("@")}
                onPress={() =>
                  run(async () => {
                    await api("POST", "/auth/email/start", { email: email.trim().toLowerCase() }, false);
                    setMode("code");
                  })
                }
              />
              <Button kind="text" title={t("ui.cancel")} onPress={() => setMode("choose")} style={{ marginTop: 6 }} />
            </>
          )}
          {mode === "code" && (
            <>
              <Text style={T.small}>{t("auth.codeSent", { email })}</Text>
              <TextInput
                style={[s.input, s.code]}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                autoFocus
                accessibilityLabel={t("auth.codeLabel")}
              />
              <Button
                big
                title={t("ui.verify")}
                loading={busy}
                disabled={code.length !== 6}
                onPress={() =>
                  run(async () => {
                    const session = await api<Session>("POST", "/auth/email/verify", { email: email.trim().toLowerCase(), code, deviceId: deviceId() }, false);
                    await setSession(session);
                    registerDevice();
                    router.replace("/(tabs)");
                  })
                }
              />
              <Button kind="text" title={t("ui.resend")} onPress={() => setMode("email")} style={{ marginTop: 6 }} />
            </>
          )}
          {error && <Text style={[T.small, { color: C.peligro, marginTop: 10 }]}>{error}</Text>}
        </View>
        <Text style={s.credit}>Itapúa · Sentinel-2 · {t("attribution.copernicus")}</Text>
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
