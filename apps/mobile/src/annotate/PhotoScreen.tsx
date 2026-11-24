import { Image, Pressable, View } from "react-native";
import { X } from "lucide-react-native";
import { LIMITS, t } from "@yvy/shared";
import { VoiceRecorder } from "../ui/VoiceRecorder";
import { Button, ScreenBody, s as k, Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { AnnotateHeader } from "./Header";
import { Progress } from "./Progress";
import { st } from "./styles";
import type { AnnotateState } from "./useAnnotate";

/** 4. Foto: fotos y nota de voz opcionales antes de guardar. */
export function PhotoScreen({ a }: { a: AnnotateState }) {
  const { stationMode, steps, missingPhoto, missingLocation, photos, maxNewPhotos, setCamera, editing, voice, setVoice, save, existingPhotos, removePhoto, hasVoice } = a;
  return (
    <View style={k.screen}>
      <AnnotateHeader a={a} />
      <Progress i={stationMode ? 1 : steps.length} n={stationMode ? 2 : steps.length + 1} />
      <ScreenBody
        footer={
          <>
            {(missingPhoto || missingLocation) && (
              <Text style={T.small}>
                {missingPhoto && missingLocation ? t("app.task.needsPhotoAndLocation") : missingPhoto ? t("app.task.needsPhoto") : t("app.task.needsLocation")}
              </Text>
            )}
            {photos.length < maxNewPhotos && <Button kind="secondary" title={t("app.common.takePhoto")} onPress={() => setCamera(true)} />}
            <Button big disabled={missingPhoto || missingLocation} title={editing ? t("app.record.save") : photos.length || voice ? t("app.common.done") : t("app.common.skipPhoto")} onPress={save} />
          </>
        }
      >
        <Text style={T.title}>{t("app.add.photo")}</Text>
        {photos.length + existingPhotos > 0 && <Text style={[T.small, { marginTop: 6 }]}>{t("app.photos.count", { n: photos.length + existingPhotos, max: LIMITS.photos.maxPerRecord })}</Text>}
        <View style={st.photos}>
          {photos.map((p, i) => (
            <View key={p.thumbUri}>
              <Image source={{ uri: p.thumbUri }} style={st.thumb} />
              <Pressable accessibilityRole="button" accessibilityLabel={t("app.photo.discard")} onPress={() => removePhoto(i)} style={st.thumbX} hitSlop={6}>
                <X size={18} color={C.blanco} />
              </Pressable>
            </View>
          ))}
        </View>
        {!hasVoice && <VoiceRecorder value={voice} onChange={setVoice} />}
      </ScreenBody>
    </View>
  );
}
