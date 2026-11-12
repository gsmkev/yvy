import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { noteOrganizationEntry } from "../src/lib/org";
import { registerDevice } from "../src/lib/push";
import { api, setSession, type Session } from "../src/lib/session";
import { deviceId } from "../src/lib/sync";
import { Button, Text } from "../src/ui/kit";
import { C, T } from "../src/ui/theme";

/** Vinculación del empleado con el QR que genera el administrador (anexo §4.2). */
export default function Scan() {
  const [perm, request] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  if (!perm) return null;
  if (!perm.granted)
    return (
      <View style={s.center}>
        <Text style={s.text}>{t("app.cameraDenied")}</Text>
        <Button title={t("app.allowCamera")} onPress={request} />
      </View>
    );

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={async ({ data }) => {
          if (busy.current) return;
          const m = /^yvy:\/\/link\?c=([\w-]+)$/.exec(data);
          if (!m) return;
          busy.current = true;
          try {
            const session = await api<Session>(
              "POST",
              "/auth/link/redeem",
              { code: m[1], deviceId: deviceId() },
              false,
            );
            await setSession(session);
            noteOrganizationEntry(session);
            registerDevice();
            router.replace("/(tabs)");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setTimeout(() => (busy.current = false), 2500);
          }
        }}
      />
      <View style={s.overlay}>
        <Text style={s.title}>{t("app.scanTitle")}</Text>
        <Text style={s.text}>{t("app.scanHelp")}</Text>
        {error && <Text style={s.error}>{error}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: C.papel },
  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 24, backgroundColor: "rgba(20,26,18,0.85)" },
  title: { ...T.title, color: C.papel },
  text: { ...T.body, color: C.papel },
  error: { ...T.small, color: "#FFB4A6", marginTop: 8 },
});
