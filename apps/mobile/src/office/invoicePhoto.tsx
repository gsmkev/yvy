/** Foto de la factura con la cámara (teléfono). En la vista web hay otra versión con selector de archivo (invoicePhoto.web.tsx). */
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera } from "lucide-react-native";
import { t } from "@yvy/shared";
import { Button, Text } from "../ui/kit";
import { C, T, TOUCH } from "../ui/theme";

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Hay cámara en este equipo (en la web no: ahí se elige un archivo). */
export const HAS_CAMERA = true;

export function InvoicePhotoButton({ title, onPick, disabled, loading }: { title: string; onPick: (p: PickedPhoto) => void; disabled?: boolean; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button kind="secondary" icon={Camera} title={title} onPress={() => setOpen(true)} disabled={disabled} loading={loading} />
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <CameraSheet
          onClose={() => setOpen(false)}
          onShot={(p) => {
            setOpen(false);
            onPick(p);
          }}
        />
      </Modal>
    </>
  );
}

function CameraSheet({ onClose, onShot }: { onClose: () => void; onShot: (p: PickedPhoto) => void }) {
  const [perm, request] = useCameraPermissions();
  const [ref, setRef] = useState<CameraView | null>(null);
  const [busy, setBusy] = useState(false);
  if (!perm) return null;
  if (!perm.granted)
    return (
      <View style={{ flex: 1, backgroundColor: C.papel, padding: 20, justifyContent: "center", gap: 12 }}>
        <Text style={T.body}>{t("app.common.cameraDenied")}</Text>
        <Button title={t("app.common.allowCamera")} onPress={request} />
        <Button kind="text" title={t("ui.common.cancel")} onPress={onClose} />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={setRef} style={{ flex: 1 }} facing="back" />
      <View style={st.row}>
        <Pressable onPress={onClose} accessibilityLabel={t("ui.common.cancel")} hitSlop={12} style={{ width: 80 }}>
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
              onShot({ uri: pic.uri, width: pic.width, height: pic.height });
            } finally {
              setBusy(false);
            }
          }}
        />
        <View style={{ width: 80 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28, paddingVertical: 24, backgroundColor: "#000" },
  shutter: { width: TOUCH + 20, height: TOUCH + 20, borderRadius: (TOUCH + 20) / 2, borderWidth: 6, borderColor: C.blanco, backgroundColor: C.accion },
});
