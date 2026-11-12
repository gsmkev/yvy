/** Escuchar la nota de voz de un registro (F-09): el archivo local si lo grabó este celular; si no, por URL firmada con señal. */
import { useState } from "react";
import { View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { t } from "@yvy/shared";
import { api } from "../lib/session";
import { Button, Text } from "./kit";
import { T } from "./theme";

function Player({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  return (
    <Button
      kind="secondary"
      title={status.playing ? t("app.voicePause") : t("app.voicePlay")}
      onPress={() => {
        if (status.playing) return player.pause();
        if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) void player.seekTo(0);
        player.play();
      }}
    />
  );
}

export function VoicePlayer({ id, uri, uploaded }: { id: string; uri: string | null; uploaded: boolean }) {
  const [remote, setRemote] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const source = uri ?? remote;
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={T.heading}>{t("app.voiceNote")}</Text>
      <View style={{ marginTop: 8 }}>
        {source ? (
          <Player uri={source} />
        ) : (
          <Button
            kind="secondary"
            title={t("app.voiceListen")}
            disabled={!uploaded}
            onPress={() =>
              api<{ url: string }>("GET", `/media/attachments/${id}`).then(
                (r) => setRemote(r.url),
                () => setError(true),
              )
            }
          />
        )}
      </View>
      {error && <Text style={[T.small, { marginTop: 8 }]}>{t("app.voiceOtherPhone")}</Text>}
    </View>
  );
}
