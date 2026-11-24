/** Encabezado del asistente de anotación. */
import { Pressable } from "react-native";
import { router, Stack } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";
import { t } from "@yvy/shared";
import { C } from "../ui/theme";
import type { AnnotateState } from "./useAnnotate";

/** Encabezado con el título según el paso y el botón para volver. */
export function AnnotateHeader({ a }: { a: AnnotateState }) {
  return (
    <Stack.Screen
      options={{
        headerShown: a.phase.name !== "done",
        title: a.plot ? a.plot.name : a.scanPoi ? a.scanPoi.name : t("app.common.annotate"),
        headerLeft: () => (
          <Pressable onPress={a.back} hitSlop={12} accessibilityLabel={t("ui.common.cancel")} style={{ paddingHorizontal: 8 }}>
            <ArrowLeft size={24} color={C.tinta} />
          </Pressable>
        ),
        headerRight: () => (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t("ui.common.cancel")} style={{ paddingHorizontal: 8 }}>
            <X size={22} color={C.tinta2} />
          </Pressable>
        ),
      }}
    />
  );
}
