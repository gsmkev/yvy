/** F-29: las pantallas que escriben datos no se abren en modo solo lectura; se explica y se ofrece salir del modo. */
import type { ComponentType } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { setReadOnly, useReadOnly } from "../lib/readOnly";
import { Button, s as k, Text } from "./kit";
import { T } from "./theme";

export function withWriteAccess<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function Guarded(props: P) {
    const readOnly = useReadOnly();
    if (!readOnly) return <Screen {...props} />;
    return (
      <View style={[k.screen, k.pad]}>
        <Text style={T.title}>{t("app.readOnlyTitle")}</Text>
        <Text style={[T.body, { marginTop: 8 }]}>{t("app.readOnlyBody")}</Text>
        <Button big title={t("app.readOnlyLeave")} onPress={() => setReadOnly(false)} style={{ marginTop: 24 }} />
        <Button kind="text" title={t("app.readOnlyBack")} onPress={() => router.back()} style={{ marginTop: 8 }} />
      </View>
    );
  }
  Guarded.displayName = `WithWriteAccess(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return Guarded;
}
