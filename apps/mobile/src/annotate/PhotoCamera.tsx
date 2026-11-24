import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack } from "expo-router";
import { t } from "@yvy/shared";
import type { LocalPhoto } from "../db/store";
import { photoQualityWarning, processPhoto } from "../lib/photos";
import { PhotoMarkup } from "../ui/PhotoMarkup";
import { Button, s as k, Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { st } from "./styles";

export function PhotoCamera({ onDone }: { onDone: (p: LocalPhoto | null) => void }) {
  const [perm, request] = useCameraPermissions();
  const [ref, setRef] = useState<CameraView | null>(null);
  const [busy, setBusy] = useState(false);
  // F-08: después del disparo se puede dibujar encima (flecha, círculo) antes de procesar la foto.
  const [shot, setShot] = useState<{ uri: string; width: number; height: number } | null>(null);
  if (!perm) return null;
  if (shot)
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <PhotoMarkup
          uri={shot.uri}
          width={shot.width}
          height={shot.height}
          onDone={async (r) => {
            if (!r) return onDone(null);
            try {
              onDone(await processPhoto(r.uri, r.width, r.height));
            } catch {
              onDone(null);
            }
          }}
        />
      </>
    );
  if (!perm.granted)
    return (
      <View style={[k.screen, k.pad, { justifyContent: "center", gap: 12 }]}>
        <Text style={T.body}>{t("app.common.cameraDenied")}</Text>
        <Button title={t("app.common.allowCamera")} onPress={request} />
        <Button kind="text" title={t("ui.common.cancel")} onPress={() => onDone(null)} />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView ref={setRef} style={{ flex: 1 }} facing="back" />
      <View style={st.shutterRow}>
        <Pressable onPress={() => onDone(null)} accessibilityLabel={t("ui.common.cancel")} hitSlop={12} style={{ width: 64 }}>
          <Text style={[T.bodyMedium, { color: C.blanco }]}>{t("ui.common.cancel")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("app.common.takePhoto")}
          disabled={busy}
          style={[st.shutter, busy && { opacity: 0.5 }]}
          onPress={async () => {
            if (!ref) return;
            setBusy(true);
            try {
              const pic = await ref.takePictureAsync({ quality: 0.9 });
              const warning = await photoQualityWarning(pic.uri, pic.width, pic.height);
              setBusy(false);
              const keep = () => setShot({ uri: pic.uri, width: pic.width, height: pic.height });
              // X-09: aviso sin bloquear. "Sacarla de nuevo" descarta esta toma; "Dejarla así" sigue con ella.
              if (!warning) return keep();
              Alert.alert(warning, undefined, [
                { text: t("app.photo.qualityRetake"), style: "cancel" },
                { text: t("app.photo.qualityKeep"), onPress: keep },
              ]);
            } catch {
              setBusy(false);
            }
          }}
        />
        <View style={{ width: 64 }} />
      </View>
    </View>
  );
}
