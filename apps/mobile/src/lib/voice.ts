/** Nota de voz (F-09): AAC mono de bajo peso (~4 KB por segundo), un solo archivo .m4a por registro. */
import * as FileSystem from "expo-file-system/legacy";
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from "expo-audio";
import { LIMITS, newId } from "@yvy/shared";
import type { LocalAudio } from "../db/store";

export const voiceOptions = (): RecordingOptions => ({
  directory: "document",
  fileName: `voz-${newId()}`,
  extension: ".m4a",
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  // Android: m4a (mpeg4 + aac), no el 3gp/amr que usa el preset de baja calidad; así el mime es el mismo en los dos sistemas.
  android: { extension: ".m4a", outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: "audio/mp4", bitsPerSecond: 32000 },
});

/** Lo grabado, con su peso. Si pasa el tope se descarta (no se manda algo que el servidor va a rechazar). */
export async function describeRecording(uri: string): Promise<LocalAudio | null> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.size <= 0) return null;
  if (info.size > LIMITS.audio.maxBytes) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return null;
  }
  return { uri, bytes: info.size };
}

export const discardRecording = (a: LocalAudio): Promise<void> => FileSystem.deleteAsync(a.uri, { idempotent: true });

export const sizeLabel = (bytes: number): string => (bytes >= 1e6 ? `${(bytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
