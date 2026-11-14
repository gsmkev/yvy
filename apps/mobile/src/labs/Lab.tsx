/** Esqueleto común de las herramientas del laboratorio: introducción → resultado de ejemplo. Sin análisis real. */
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { t } from "@yvy/shared";
import { Button, ScreenBody, s as k, Text } from "../ui/kit";
import { C, RADIUS, T } from "../ui/theme";

export function PreviewNotice() {
  return (
    <View style={st.notice}>
      <Text style={T.small}>{t("app.labsPreviewNotice")}</Text>
    </View>
  );
}

/** Dato con su leyenda, para los resultados. */
export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.fact}>
      <Text style={T.small}>{label}</Text>
      <Text style={[T.title, { marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

/** `actions`: lo que se ofrece después del ejemplo (una pista y un botón principal); "Volver al laboratorio" pasa a secundario. */
export function Lab({ title, intro, art, result, actions }: { title: string; intro: string; art?: ReactNode; result: ReactNode; actions?: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={k.screen}>
      <Stack.Screen options={{ title: "" }} />
      <ScreenBody
        footer={
          shown ? (
            <>
              {actions}
              <Button kind={actions ? "secondary" : "primary"} big={!actions} title={t("app.labsBackToLab")} onPress={() => router.back()} />
            </>
          ) : (
            <Button big title={t("app.labsTryExample")} onPress={() => setShown(true)} />
          )
        }
      >
        <Text style={T.title}>{shown ? t("app.labsExampleTitle") : title}</Text>
        {shown ? (
          <>
            {art ? <View style={st.art}>{art}</View> : null}
            {result}
            <Text style={[T.body, { marginTop: 24 }]}>{t("app.labsOffline")}</Text>
            <PreviewNotice />
          </>
        ) : (
          <>
            <Text style={[T.body, { marginTop: 12 }]}>{intro}</Text>
            <PreviewNotice />
          </>
        )}
      </ScreenBody>
    </View>
  );
}

const st = StyleSheet.create({
  notice: { backgroundColor: C.atencionSuave, borderRadius: RADIUS, padding: 16, marginTop: 20 },
  art: { alignItems: "center", marginTop: 16, marginBottom: 16, borderRadius: RADIUS, overflow: "hidden", alignSelf: "center" },
  fact: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.linea },
});
