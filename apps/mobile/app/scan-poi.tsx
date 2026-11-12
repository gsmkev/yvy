/** Escanear el QR pegado en un punto de interés (bebedero, silo, pluviómetro) y anotar ahí (F-28). Anda sin señal. */
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, Stack } from "expo-router";
import { parsePoiQr, t } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { Button, Text } from "../src/ui/kit";
import { C, T } from "../src/ui/theme";

export default function ScanPoi() {
  const [perm, request] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  if (!perm) return null;
  if (!perm.granted)
    return (
      <View style={s.center}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={T.body}>{t("app.cameraDenied")}</Text>
        <Button title={t("app.allowCamera")} onPress={request} />
      </View>
    );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "" }} />
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          if (busy.current) return;
          const id = parsePoiQr(data);
          if (!id) return; // otro QR: se ignora sin molestar
          busy.current = true;
          // El punto se busca en el celular: así funciona sin señal.
          const poi = getDb().pois().find((p) => p.id === id);
          if (!poi) {
            setError(t("app.poiScanUnknown"));
            setTimeout(() => (busy.current = false), 2500);
            return;
          }
          router.replace({ pathname: "/annotate", params: { poiId: poi.id } });
        }}
      />
      <View style={s.overlay}>
        <Text style={s.title}>{t("app.poiScanTitle")}</Text>
        <Text style={s.text}>{t("app.poiScanHelp")}</Text>
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
