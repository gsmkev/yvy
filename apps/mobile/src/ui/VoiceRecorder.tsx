/**
 * Grabar una nota de voz para el registro (F-09). El micrófono solo se enciende mientras se toca "Grabar" y se apaga
 * al terminar o al llegar al máximo. Funciona sin señal: el archivo queda en el celular y sube después, como las fotos.
 * No hay transcripción: necesitaría un modelo de pago y la señal que acá falta.
 */
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { LIMITS, t } from "@yvy/shared";
import type { LocalAudio } from "../db/store";
import { describeRecording, discardRecording, sizeLabel, voiceOptions } from "../lib/voice";
import { Button, Text } from "./kit";
import { C, T } from "./theme";

export function VoiceRecorder({ value, onChange }: { value: LocalAudio | null; onChange: (a: LocalAudio | null) => void }) {
  const recorder = useAudioRecorder(voiceOptions());
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [denied, setDenied] = useState(false);
  const [capped, setCapped] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      clear();
      // Salir de la pantalla apaga el micrófono.
      void recorder.stop().catch(() => {});
    },
    [],
  );

  const stop = async () => {
    clear();
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (recorder.uri) onChange(await describeRecording(recorder.uri));
    } catch {
      onChange(null);
    }
  };

  const start = async () => {
    setDenied(false);
    setCapped(false);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return setDenied(true);
    try {
      await setAudioModeAsync({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      return setDenied(true);
    }
    setRecording(true);
    setSeconds(0);
    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= LIMITS.audio.maxSeconds) {
        setCapped(true);
        void stop();
      }
    }, 500);
  };

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={T.heading}>{t("app.voiceRecordTitle")}</Text>
      {recording ? (
        <>
          <Text style={[T.number, { marginTop: 8, color: C.peligro }]}>{t("app.voiceRecording", { s: seconds })}</Text>
          <Button big title={t("app.voiceStop")} onPress={stop} style={{ marginTop: 8 }} />
        </>
      ) : value ? (
        <>
          <Text style={[T.body, { marginTop: 6 }]}>{t("app.voiceSaved", { size: sizeLabel(value.bytes) })}</Text>
          <Button
            kind="danger"
            title={t("app.voiceDelete")}
            onPress={() => {
              void discardRecording(value);
              onChange(null);
            }}
            style={{ marginTop: 8 }}
          />
        </>
      ) : (
        <>
          <Text style={[T.small, { marginTop: 4 }]}>{t("app.voiceHint")}</Text>
          <Button kind="secondary" big title={t("app.voiceRecord")} onPress={start} style={{ marginTop: 8 }} />
        </>
      )}
      {capped && <Text style={[T.small, { marginTop: 8 }]}>{t("app.voiceTooLong", { s: LIMITS.audio.maxSeconds })}</Text>}
      {denied && <Text style={[T.small, { marginTop: 8, color: C.peligro }]}>{t("app.voiceDenied")}</Text>}
    </View>
  );
}
