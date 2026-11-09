import campo from "../assets/campo-itapua.webp";
import { QrCode } from "lucide-react-native";
import { useState } from "react";
import { ImageBackground, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { api, setSession, type Session } from "../src/lib/session";
import { deviceId } from "../src/lib/sync";
import { registerDevice } from "../src/lib/push";
import { Button } from "../src/ui/kit";
import { C } from "../src/ui/theme";

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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.root}>
      <ImageBackground source={campo} resizeMode="cover" style={s.photo} imageStyle={{ opacity: 0.85 }}>
        <View style={s.shade} />
        <Text style={s.credit}>Itapúa · Sentinel-2 · {t("attribution.copernicus")}</Text>
      </ImageBackground>
      <Text style={s.logo}>Yvy</Text>
      <Text style={s.tag}>{t("ui.tagline")}</Text>
      <View style={s.box}>
        {mode === "choose" && (
          <>
            <Button title={t("app.loginQr")} icon={QrCode} onPress={() => router.push("/scan")} />
            <Button title={t("app.loginEmail")} variant="secondary" onPress={() => setMode("email")} />
          </>
        )}
        {mode === "email" && (
          <>
            <Text style={s.label}>{t("auth.emailLabel")}</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Button
              title={t("auth.sendCode")}
              disabled={busy || !email.includes("@")}
              onPress={() =>
                run(async () => {
                  await api("POST", "/auth/email/start", { email: email.trim().toLowerCase() }, false);
                  setMode("code");
                })
              }
            />
          </>
        )}
        {mode === "code" && (
          <>
            <Text style={s.help}>{t("auth.codeSent", { email })}</Text>
            <TextInput
              style={[s.input, s.code]}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
            />
            <Button
              title={t("ui.verify")}
              disabled={busy || code.length !== 6}
              onPress={() =>
                run(async () => {
                  const session = await api<Session>(
                    "POST",
                    "/auth/email/verify",
                    { email: email.trim().toLowerCase(), code, deviceId: deviceId() },
                    false,
                  );
                  await setSession(session);
                  registerDevice();
                  router.replace("/(tabs)");
                })
              }
            />
          </>
        )}
        {error && <Text style={s.error}>{error}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surco, justifyContent: "flex-end", padding: 24, paddingBottom: 40 },
  photo: { position: "absolute", top: 0, left: 0, right: 0, height: "58%", justifyContent: "flex-end" },
  shade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(30,36,25,0.25)" },
  credit: { color: C.lino, opacity: 0.75, fontSize: 10, fontFamily: "monospace", padding: 12 },
  logo: { color: C.lino, fontSize: 44, fontWeight: "800" },
  tag: { color: C.lino, opacity: 0.7, fontSize: 16, marginBottom: 24 },
  box: { backgroundColor: C.lino, borderRadius: 14, padding: 16, gap: 12 },
  label: { fontWeight: "600", color: C.surco },
  help: { color: C.surco },
  input: {
    backgroundColor: C.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    minHeight: 56,
    fontSize: 18,
  },
  code: { textAlign: "center", fontSize: 28, letterSpacing: 8 },
  error: { color: C.alerta },
});
