/**
 * Un aviso con su "¿Te sirvió?". Lo usan Hoy (avisos activos) y Gestión (lista completa). `muted` es para los que ya
 * terminaron: mismo contenido, sin el color de urgencia.
 */
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { t, type MessageKey } from "@yvy/shared";
import type { Alert } from "../db/store";
import { Text } from "./kit";
import { C, RADIUS, T } from "./theme";

export function AlertCard({
  alert: a,
  voted,
  onVote,
  picked,
  muted,
  farmName,
  when,
  onLayout,
}: {
  alert: Alert;
  /** Lo que ya votó esta persona; undefined si todavía no. */
  voted: boolean | undefined;
  onVote: (useful: boolean) => void;
  picked?: boolean;
  muted?: boolean;
  farmName?: string;
  /** Línea de vigencia ("Hasta el 20/11/2026"). */
  when?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const strong = a.severity === "warning" && !muted;
  const fg = strong ? C.blanco : C.tinta;
  const soft = strong ? "rgba(255,255,255,0.8)" : C.tinta2;
  return (
    <View onLayout={onLayout} style={[st.alert, strong ? st.alertStrong : muted ? st.alertMuted : st.alertSoft, picked && st.alertPicked]}>
      <Text style={[T.heading, { color: strong ? C.blanco : muted ? C.tinta2 : C.atencion }]}>
        {t(`ui.alertKind_${a.kind}` as MessageKey)}
        {a.probability ? ` · ${t(`ui.probability_${a.probability}` as MessageKey).toLowerCase()}` : ""}
      </Text>
      <Text style={[T.body, { color: fg, marginTop: 4 }]}>{a.summary}</Text>
      {(farmName || when) && <Text style={[T.small, { color: soft, marginTop: 4 }]}>{[farmName, when].filter(Boolean).join(" · ")}</Text>}
      <Text style={[T.small, { color: soft, marginTop: 8 }]}>{t("ui.orientative", { source: a.source })}</Text>
      <View style={st.vote}>
        {voted === undefined ? (
          <>
            <Text style={[T.small, { color: soft }]}>{t("ui.useful")}</Text>
            {([true, false] as const).map((useful) => (
              <Pressable
                key={String(useful)}
                accessibilityRole="button"
                accessibilityLabel={`${t("ui.useful")} ${useful ? t("app.yes") : t("app.no")}`}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => onVote(useful)}
                style={st.voteBtn}
              >
                <Text style={[T.smallMedium, { color: fg, textDecorationLine: "underline" }]}>{useful ? t("app.yes") : t("app.no")}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          <Text style={[T.small, { color: soft }]}>{t("app.thanks")}</Text>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  alert: { borderRadius: RADIUS, padding: 16, marginTop: 16 },
  alertStrong: { backgroundColor: C.peligro },
  alertSoft: { backgroundColor: C.atencionSuave },
  alertMuted: { backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea },
  alertPicked: { borderWidth: 3, borderColor: C.tinta },
  vote: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 4, minHeight: 44 },
  voteBtn: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
});
