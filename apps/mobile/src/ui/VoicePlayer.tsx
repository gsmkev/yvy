/** Escuchar la nota de voz de un registro: el archivo local si lo grabó este celular; si no, por URL firmada con señal. */
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
      title={status.playing ? t("app.voice.pause") : t("app.voice.play")}
      onPress={() => {
        if (status.playing) return player.pause();
        if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) void player.seekTo(0);
        player.play();
      }}
    />
  );
}

/** Reproductor de la nota de voz de un registro. */
export function VoicePlayer({ id, uri, uploaded }: { id: string; uri: string | null; uploaded: boolean }) {
  const [remote, setRemote] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const source = uri ?? remote;
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={T.heading}>{t("app.voice.note")}</Text>
      <View style={{ marginTop: 8 }}>
        {source ? (
          <Player uri={source} />
        ) : (
          <Button
            kind="secondary"
            title={t("app.voice.listen")}
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
      {error && <Text style={[T.small, { marginTop: 8 }]}>{t("app.voice.otherPhone")}</Text>}
    </View>
  );
}
