import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { registerDevice } from "../src/lib/push";
import { api, setSession, type Session } from "../src/lib/session";
import { deviceId } from "../src/lib/sync";
import { Button } from "../src/ui/kit";
import { C } from "../src/ui/theme";

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
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: C.lino },
  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: "rgba(30,36,25,0.85)" },
  title: { color: C.lino, fontSize: 20, fontWeight: "700" },
  text: { color: C.lino, fontSize: 16 },
  error: { color: "#FFB4A6", marginTop: 8 },
});
